#!/usr/bin/env node
// Modern slang and informal English (docs/PLATFORM.md section 17): what it
// means, where it fits (texting, friends, casual at work, or keep it away from
// work), where it is said, natural examples, who says it, and three quizzes per
// entry. Drafted with Gemini in our own words, then:
//
//   1. a blind check: a checker answers the meaning, the context and the reply
//      quiz without the key; any miss drops the entry;
//   2. a recency and appropriateness review by a second, stronger model: slurs,
//      sexual or demeaning terms and anything obsolete are dropped; terms that
//      are still understood but sound a few years old are kept and marked
//      dated, with a note on how they come across;
//   3. a register check: ordinary vocabulary that is not slang or informal
//      ("amazing") is dropped, and EXCLUDED_TERMS (lib/slang-exclusions.mjs: group or political
//      labels, words for children) are left out by editorial decision.
//
//   node scripts/content/slang.mjs [--only reactions] [--check-only]
//
// Writes content/slang/<category>.json:
//   {format: 1, category, items: [...], check: {results: {<term key>: {status, note, dated?}}}}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHECK_MODEL, generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { JUDGE_MODEL } from "./lib/blind-check.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { EXCLUDED_TERMS } from "./lib/slang-exclusions.mjs";
import { isSensitive, profanityIn, sha256Hex, textKey } from "./lib/text.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag("--only");
const checkOnly = args.includes("--check-only");

/** [id, title, what to cover] */
export const SLANG_CATEGORIES = [
  ["reactions", "Reactions", "reacting to news, jokes and surprises (approval, disbelief, being impressed or unimpressed)"],
  ["feelings", "Feelings and moods", "how someone feels: tired, stressed, excited, embarrassed, fed up, content"],
  ["people", "People", "describing people and how they behave, kindly or teasingly, never cruelly"],
  ["quality", "Good and bad", "saying something is great, mediocre, overrated, cheap-looking or impressive"],
  ["agreement", "Agreement and emphasis", "agreeing, emphasising, being honest, softening or intensifying what you say"],
  ["online", "Online and texting", "texting, group chats, social media and internet culture"],
  ["work", "Casual at work", "informal words that are fine with colleagues in a relaxed workplace (meetings, deadlines, effort, office life)"],
  ["money", "Money and shopping", "money, prices, spending, saving and bargains"],
  ["going-out", "Going out and food", "plans, parties, restaurants, food and hanging out"],
  ["relationships", "Friends and dating", "friendship and dating in neutral, non-sexual terms"],
  ["uk", "British informal", "everyday informal British English that Americans may not know"],
  ["us", "American informal", "everyday informal American English that Britons may not know"],
];

const PER_CATEGORY = 42;
const FITS = ["texting", "friends", "work-casual", "avoid-at-work"];

const SYSTEM = `You write an informal-English guide for advanced adult learners (C1 and above) who speak excellent textbook English but miss the slang and informal expressions that native speakers use today.
Write in your own words; never copy a dictionary or a website. Describe how words are really used now (2020s), by whom, and how they come across.
Never include slurs, sexual terms, drug terms, insults about identity, swearing or anything demeaning. Examples are about everyday adult life.`;

const SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          partOfSpeech: { type: "string" },
          meaning: { type: "string" },
          register: { type: "string", enum: ["informal", "very-informal"] },
          fits: { type: "array", items: { type: "string", enum: FITS } },
          region: { type: "string", enum: ["US", "UK", "global"] },
          examples: { type: "array", items: { type: "string" } },
          usageNote: { type: "string" },
          era: { type: "string", enum: ["current", "dated"] },
          popularSince: { type: "string" },
          contextQuiz: {
            type: "object",
            properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "integer" } },
            required: ["question", "options", "answer"],
          },
          replyQuiz: {
            type: "object",
            properties: { message: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "integer" } },
            required: ["message", "options", "answer"],
          },
        },
        required: ["term", "partOfSpeech", "meaning", "register", "fits", "region", "examples", "usageNote", "era", "popularSince", "contextQuiz", "replyQuiz"],
      },
    },
  },
  required: ["entries"],
};

function prompt(category, exclude) {
  const [, title, brief] = category;
  return `Category: ${title}: ${brief}.

Write ${PER_CATEGORY} different slang words and informal expressions in this category that native speakers really use in the 2020s. Mostly current ones; a few that are still widely understood but sound a few years old are fine if you mark them era "dated".

For each:
- term: the word or expression as people say it (lowercase unless it is always capitalised).
- partOfSpeech: e.g. "adjective", "verb", "phrase", "interjection".
- meaning: plain English, at most 110 characters, without using the term.
- register: "informal" or "very-informal".
- fits: where it is natural, any of "texting", "friends", "work-casual" (fine with colleagues in a relaxed office); add "avoid-at-work" when it would sound unprofessional with a manager or client.
- region: "US", "UK" or "global".
- examples: 2 or 3 natural sentences or text messages that use the term, each 5 to 22 words.
- usageNote: who says it and how it sounds (age group, tone, irony), at most 140 characters.
- era: "current" or "dated"; popularSince: the decade it became common, e.g. "2010s".
- contextQuiz: a question about where or when the term fits, with 4 options (situations), exactly one clearly right; answer is its 0-based index.
- replyQuiz: a short message that uses the term, and 3 possible replies, exactly one natural and fitting (the others misunderstand the term or clash in tone); answer is its 0-based index.

Never: slurs, sexual or drug terms, swearing, insults about appearance or identity, anything mean.${exclude.length ? `\n\nAlready in the guide, do not repeat: ${exclude.join("; ")}` : ""}`;
}

const CHECK_SYSTEM = `You are a native speaker of English in your thirties who follows how people talk online and offline. For each item, answer three questions about an informal term:
- meaning: the 0-based index of the right meaning among four.
- context: the 0-based index of the right answer to the context question.
- reply: the 0-based index of the most natural reply to the message.`;

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: { type: "object", properties: { n: { type: "integer" }, meaning: { type: "integer" }, context: { type: "integer" }, reply: { type: "integer" } }, required: ["n", "meaning", "context", "reply"] },
    },
  },
  required: ["answers"],
};

const REVIEW_SYSTEM = `You review an informal-English guide for adult learners before publication. For each entry decide:
- offensive: true if the term or any example is a slur, sexual, about drugs, swearing, demeaning about any group or appearance, or likely to offend in normal company.
- status: "current" if people commonly use it now; "dated" if still widely understood but it sounds a few years old or ironic; "obsolete" if people rarely use it any more.
- regionOk: true if the stated region (US, UK or global) is right.
- meaningOk: true if the meaning and examples describe how the term is really used.
- datedNote: when status is dated, one short sentence on how it sounds now; otherwise "".`;

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, offensive: { type: "boolean" }, status: { type: "string", enum: ["current", "dated", "obsolete"] }, regionOk: { type: "boolean" }, meaningOk: { type: "boolean" }, datedNote: { type: "string" } },
        required: ["n", "offensive", "status", "regionOk", "meaningOk", "datedNote"],
      },
    },
  },
  required: ["verdicts"],
};

/**
 * Left out by editorial decision even when every check passes: terms tied to
 * a nationality or group, and political labels, which say more about the
 * speaker than an advanced learner wants to borrow.
 */
export { EXCLUDED_TERMS };

const REGISTER_SYSTEM = `You are a lexicographer. For each term and meaning decide:
- informal: true if, used with this meaning, it is slang or clearly informal English; false if it is ordinary neutral vocabulary that is just as natural in formal writing with the same meaning (for example "amazing", "sarcastic", "overwhelmed", "discounted").`;
const REGISTER_SCHEMA = {
  type: "object",
  properties: { verdicts: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, informal: { type: "boolean" } }, required: ["n", "informal"] } } },
  required: ["verdicts"],
};

/** Drops passing entries that are ordinary vocabulary rather than slang or informal English. */
async function registerCheck(file) {
  file.check.register ??= {};
  const pending = file.items.filter((e) => file.check.results[textKey(e.term)]?.status === "pass" && file.check.register[textKey(e.term)] === undefined);
  for (let start = 0; start < pending.length; start += 40) {
    const batch = pending.slice(start, start + 40);
    const result = await generateJson({ model: JUDGE_MODEL, system: REGISTER_SYSTEM, prompt: JSON.stringify(batch.map((e, i) => ({ n: i + 1, term: e.term, meaning: e.meaning, example: e.examples[0] })), null, 1), schema: REGISTER_SCHEMA });
    const byN = new Map((result.verdicts ?? []).map((v) => [v.n, v]));
    batch.forEach((e, i) => {
      const informal = byN.get(i + 1)?.informal;
      file.check.register[textKey(e.term)] = informal !== false;
      if (informal === false) file.check.results[textKey(e.term)] = { status: "drop", note: "Ordinary vocabulary, not slang." };
    });
  }
  for (const e of file.items) if (EXCLUDED_TERMS.has(textKey(e.term))) file.check.results[textKey(e.term)] = { status: "drop", note: "Left out by editorial decision." };
  return file;
}

const hashOf = (text) => parseInt(sha256Hex(text).slice(0, 8), 16);
const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function cleanEntry(raw) {
  const quiz = (q, key) => ({ [key]: tidy(q?.[key]), options: (q?.options ?? []).map(tidy), answer: Number(q?.answer) });
  return {
    term: tidy(raw.term),
    partOfSpeech: tidy(raw.partOfSpeech),
    meaning: tidy(raw.meaning),
    register: raw.register,
    fits: [...new Set((raw.fits ?? []).filter((f) => FITS.includes(f)))],
    region: raw.region,
    examples: (raw.examples ?? []).map(tidy).filter(Boolean).slice(0, 3),
    usageNote: tidy(raw.usageNote),
    era: raw.era,
    popularSince: tidy(raw.popularSince).slice(0, 12),
    contextQuiz: quiz(raw.contextQuiz, "question"),
    replyQuiz: quiz(raw.replyQuiz, "message"),
  };
}

export function entryProblem(e) {
  if (!e.term || e.term.length > 40) return "term";
  if (e.meaning.length < 6 || e.meaning.length > 130) return "meaning length";
  if (e.examples.length < 2) return "fewer than two examples";
  if (e.fits.length === 0) return "no fits";
  if (e.fits.includes("work-casual") && e.fits.includes("avoid-at-work")) e.fits = e.fits.filter((f) => f !== "work-casual");
  if (e.contextQuiz.options.length !== 4 || !(e.contextQuiz.answer >= 0 && e.contextQuiz.answer < 4)) return "context quiz";
  if (e.replyQuiz.options.length < 3 || e.replyQuiz.options.length > 4 || !(e.replyQuiz.answer >= 0 && e.replyQuiz.answer < e.replyQuiz.options.length)) return "reply quiz";
  const texts = [e.term, e.meaning, e.usageNote, ...e.examples, e.contextQuiz.question, ...e.contextQuiz.options, e.replyQuiz.message, ...e.replyQuiz.options];
  if (texts.some((t) => profanityIn(t).length)) return "profanity";
  if (e.examples.some(isSensitive) || isSensitive(e.term)) return "sensitive";
  return null;
}

function distractors(entry, all) {
  return all
    .filter((o) => textKey(o.term) !== textKey(entry.term))
    .sort((a, b) => hashOf(`${entry.term}|${a.term}`) - hashOf(`${entry.term}|${b.term}`))
    .slice(0, 3)
    .map((o) => o.meaning);
}

async function draft(category, path, exclude) {
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (previous || checkOnly) return previous;
  const result = await generateJson({ system: SYSTEM, prompt: prompt(category, exclude), schema: SCHEMA });
  const seen = new Set(exclude.map(textKey));
  const items = [];
  for (const raw of result.entries ?? []) {
    const entry = cleanEntry(raw);
    if (entryProblem(entry) || seen.has(textKey(entry.term))) continue;
    seen.add(textKey(entry.term));
    items.push(entry);
  }
  return { format: 1, category: category[0], items, check: { results: {} } };
}

async function check(file) {
  const pending = file.items.filter((e) => !file.check.results[textKey(e.term)]);
  for (let start = 0; start < pending.length; start += 30) {
    const batch = pending.slice(start, start + 30);
    const views = batch.map((e, i) => {
      const meanings = [e.meaning, ...distractors(e, file.items)];
      const at = hashOf(`pos|${e.term}`) % meanings.length;
      [meanings[0], meanings[at]] = [meanings[at], meanings[0]];
      return { n: i + 1, term: e.term, meanings, contextQuestion: e.contextQuiz.question, contextOptions: e.contextQuiz.options, message: e.replyQuiz.message, replies: e.replyQuiz.options, key: at };
    });
    const [answers, review] = await Promise.all([
      generateJson({ model: CHECK_MODEL, system: CHECK_SYSTEM, prompt: JSON.stringify(views.map((v) => Object.fromEntries(Object.entries(v).filter(([name]) => name !== "key"))), null, 1), schema: CHECK_SCHEMA }),
      generateJson({
        model: JUDGE_MODEL,
        system: REVIEW_SYSTEM,
        prompt: JSON.stringify(batch.map((e, i) => ({ n: i + 1, term: e.term, meaning: e.meaning, region: e.region, examples: e.examples, usageNote: e.usageNote })), null, 1),
        schema: REVIEW_SCHEMA,
      }),
    ]);
    const byN = new Map((answers.answers ?? []).map((a) => [a.n, a]));
    const byR = new Map((review.verdicts ?? []).map((v) => [v.n, v]));
    views.forEach((view) => {
      const entry = batch[view.n - 1];
      const a = byN.get(view.n);
      const r = byR.get(view.n);
      const key = textKey(entry.term);
      if (!a || !r) file.check.results[key] = { status: "drop", note: "No answer or verdict." };
      else if (r.offensive) file.check.results[key] = { status: "drop", note: "Judged offensive." };
      else if (r.status === "obsolete") file.check.results[key] = { status: "drop", note: "Obsolete." };
      else if (!r.meaningOk || !r.regionOk) file.check.results[key] = { status: "drop", note: r.meaningOk ? "Region wrong." : "Meaning judged wrong." };
      else if (a.meaning !== view.key) file.check.results[key] = { status: "drop", note: "Blind check: meaning missed." };
      else if (a.context !== entry.contextQuiz.answer) file.check.results[key] = { status: "drop", note: "Blind check: context quiz missed." };
      else if (a.reply !== entry.replyQuiz.answer) file.check.results[key] = { status: "drop", note: "Blind check: reply quiz missed." };
      else file.check.results[key] = { status: "pass", ...(r.status === "dated" || entry.era === "dated" ? { dated: true, note: r.datedNote || "Still understood, but it sounds a few years old." } : {}) };
    });
  }
  return file;
}

const categories = SLANG_CATEGORIES.filter((c) => !only || c[0] === only);
const dir = join(CONTENT_DIR, "slang");
mkdirSync(dir, { recursive: true });
// Each category is told what the others already hold, so drafting runs in two waves.
const existingTerms = () =>
  SLANG_CATEGORIES.flatMap((c) => {
    const path = join(dir, `${c[0]}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).items.map((e) => e.term) : [];
  });
let passed = 0;
let total = 0;
for (const wave of [categories.slice(0, 6), categories.slice(6)]) {
  const exclude = existingTerms();
  await pool(wave, 6, async (category) => {
    const path = join(dir, `${category[0]}.json`);
    let file = await draft(category, path, exclude);
    if (!file) return;
    file = await registerCheck(await check(file));
    writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
    const ok = file.items.filter((e) => file.check.results[textKey(e.term)]?.status === "pass").length;
    passed += ok;
    total += file.items.length;
    console.log(`${category[0]}: ${ok}/${file.items.length}`);
  });
}
console.log(`${passed} of ${total} entries passed; Gemini ${JSON.stringify(geminiStats())}`);
