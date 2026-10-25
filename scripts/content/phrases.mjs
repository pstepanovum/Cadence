#!/usr/bin/env node
// The phrase bank ("learn phrases, not words", docs/PLATFORM.md section 17):
// high-frequency chunks, collocations and sentence frames for B2 to C2
// speakers, by situation, drafted with Gemini in our own words and put
// through a blind check before anything reaches a pack.
//
//   node scripts/content/phrases.mjs [--level C1] [--only meetings] [--round 2] [--check-only]
//
// Writes content/phrases/<level>/<situation>.json:
//   {format: 1, level, situation, rounds: [{round, items: [...]}], check: {results: {<textKey>: {status, note}}}}
//
// The blind check: a checker sees each phrase with its example and four
// meanings (the key and three from other phrases in the file) and must pick
// the right one, and says whether a fluent speaker would really say it. A
// wrong pick goes to a stronger judge: a key judged wrong is dropped, a
// checker slip is kept. Unnatural phrases and anything rated A1 or A2 (too
// basic for this bank) are dropped. Only `pass` reaches a pack.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEVEL_BRIEF, PER_BATCH, PHRASE_LEVELS, SITUATIONS } from "./data/phrase-plan.mjs";
import { CHECK_MODEL, generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { JUDGE_MODEL } from "./lib/blind-check.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { isSensitive, profanityIn, sha256Hex, textKey } from "./lib/text.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyLevel = flag("--level");
const onlySituation = flag("--only");
const round = Number(flag("--round") ?? 1);
const checkOnly = args.includes("--check-only");

const SYSTEM = `You are a lexicographer and English teacher who writes material for advanced adult learners (professionals, academics, people living abroad) who have plateaued at C1.
You write only expressions that fluent native speakers genuinely use today, in natural modern English (American and British both fine). You write everything yourself, in your own words: never copy entries, definitions or examples from any dictionary, textbook or published phrase list.
Never write anything rude, sexual, violent or political, and never use slang (that is a separate section).`;

const SCHEMA = {
  type: "object",
  properties: {
    phrases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: { type: "string", enum: ["chunk", "collocation", "frame"] },
          form: { type: "string" },
          meaning: { type: "string" },
          example: { type: "string" },
          plain: { type: "string" },
          note: { type: "string" },
        },
        required: ["text", "kind", "form", "meaning", "example", "plain", "note"],
      },
    },
  },
  required: ["phrases"],
};

function prompt(level, situation, exclude, count = PER_BATCH) {
  const [, title, brief] = situation;
  return `Situation: ${title} (${brief}).
Level: ${LEVEL_BRIEF[level]}

Write ${count} different multi-word expressions for this situation at this level. Mix three kinds:
- chunk: a fixed or semi-fixed phrase ("to be fair", "for what it's worth", "I'll keep it brief").
- collocation: words that go together with a precise meaning ("raise a concern", "a steep learning curve", "strike a balance").
- frame: the fixed opening of a sentence pattern the speaker completes ("What I'm getting at is", "The way I see it", "It's not so much that").

For each:
- text: the expression in its dictionary form, 2 to 7 words, no ellipsis, no slashes, no brackets.
- form: the exact words of the expression as they appear in the example (the same as text unless a verb or pronoun changes, e.g. text "raise a concern", form "raised a concern").
- meaning: what it means and does, in plain English, at most 110 characters, without repeating the expression.
- example: one natural spoken sentence, 8 to 24 words, set in this situation, that contains form exactly once, letter for letter.
- plain: the same idea as the example said plainly without the expression (so a learner can practise turning it into the phrase), 6 to 24 words.
- note: one short usage note, at most 120 characters: register, tone, who says it, or a trap (e.g. "Sounds diplomatic; slightly formal in British English.").

Rules: no single words; no clichés nobody says any more ("it's raining cats and dogs"); no slang; nothing rude; every example about adult life (work, study, travel, friends, family, money, health in neutral terms).${exclude.length ? `\n\nDo not repeat or rephrase any of these, they are already in the bank:\n${exclude.join("; ")}` : ""}`;
}

const CHECK_SYSTEM = `You are a native-speaker examiner checking material for advanced learners of English.
For each item you get an expression, an example sentence and four meanings.
- choice: the 0-based index of the meaning that fits the expression as used in the example.
- natural: true only if fluent native speakers genuinely say this expression today, and the example is grammatical, natural and uses it correctly.
- level: the CEFR level (A1 to C2) at which a learner would typically be able to use this expression.`;

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, choice: { type: "integer" }, natural: { type: "boolean" }, level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] } },
        required: ["n", "choice", "natural", "level"],
      },
    },
  },
  required: ["answers"],
};

const JUDGE_SYSTEM = `You are a careful lexicographer. For each item you get an expression, an example, the intended meaning (the key) and another meaning someone chose.
- keyCorrect: true only if the intended meaning accurately describes the expression as used in the example.
- note: one short sentence.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, keyCorrect: { type: "boolean" }, note: { type: "string" } }, required: ["n", "keyCorrect", "note"] } },
  },
  required: ["verdicts"],
};

const hashOf = (text) => parseInt(sha256Hex(text).slice(0, 8), 16);

/** Three distractor meanings from other phrases in the same file, chosen by hash so a rerun asks the same. */
export function distractorsFor(item, all) {
  const others = all.filter((o) => textKey(o.text) !== textKey(item.text));
  const sorted = [...others].sort((a, b) => hashOf(`${item.text}|${a.text}`) - hashOf(`${item.text}|${b.text}`));
  return sorted.slice(0, 3).map((o) => o.meaning);
}

function cleanItem(raw) {
  const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const item = { text: tidy(raw.text).replace(/[.!?]+$/, ""), kind: raw.kind, form: tidy(raw.form).replace(/[.!?]+$/, ""), meaning: tidy(raw.meaning), example: tidy(raw.example), plain: tidy(raw.plain), note: tidy(raw.note) };
  if (!item.form) item.form = item.text;
  return item;
}

/** Why a drafted phrase cannot be used, or null. */
export function draftProblem(item) {
  const words = item.text.split(" ").length;
  if (words < 2 || words > 8) return "not 2 to 8 words";
  if (/[/()[\]…]|\.\.\./.test(item.text)) return "punctuation in the expression";
  if (!item.example.toLowerCase().includes(item.form.toLowerCase())) return "example does not contain the form";
  if (item.meaning.length > 130 || item.meaning.length < 8) return "meaning length";
  if (item.example.length > 200 || item.plain.length > 200 || item.note.length > 160) return "too long";
  const all = [item.text, item.meaning, item.example, item.plain, item.note].join(" ");
  if (profanityIn(all).length) return "profanity";
  if (isSensitive(item.example) || isSensitive(item.plain)) return "sensitive topic";
  return null;
}

async function draft(level, situation, file) {
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { format: 1, level, situation: situation[0], rounds: [], check: { results: {} } };
  if (previous.rounds.some((r) => r.round === round)) return previous;
  if (checkOnly) return previous;
  const exclude = previous.rounds.flatMap((r) => r.items.map((i) => i.text));
  let drafted;
  try {
    drafted = (await generateJson({ system: SYSTEM, prompt: prompt(level, situation, exclude), schema: SCHEMA })).phrases ?? [];
  } catch (error) {
    // A long answer can run out of output tokens; two halves fit.
    if (!/MAX_TOKENS|not JSON/.test(String(error.message))) throw error;
    const first = (await generateJson({ system: SYSTEM, prompt: prompt(level, situation, exclude, PER_BATCH / 2), schema: SCHEMA })).phrases ?? [];
    const second = (await generateJson({ system: SYSTEM, prompt: prompt(level, situation, [...exclude, ...first.map((p) => p.text)], PER_BATCH / 2), schema: SCHEMA })).phrases ?? [];
    drafted = [...first, ...second];
  }
  const seen = new Set(exclude.map(textKey));
  const items = [];
  for (const raw of drafted) {
    const item = cleanItem(raw);
    if (draftProblem(item) || seen.has(textKey(item.text))) continue;
    seen.add(textKey(item.text));
    items.push(item);
  }
  return { ...previous, rounds: [...previous.rounds, { round, items }].sort((a, b) => a.round - b.round) };
}

async function check(file) {
  const all = file.rounds.flatMap((r) => r.items);
  const pending = all.filter((item) => !file.check.results[textKey(item.text)]);
  for (let start = 0; start < pending.length; start += 40) {
    const batch = pending.slice(start, start + 40);
    const views = batch.map((item, i) => {
      const options = [item.meaning, ...distractorsFor(item, all)];
      // The key's position comes from the text, so it is not always first.
      const at = hashOf(`pos|${item.text}`) % options.length;
      [options[0], options[at]] = [options[at], options[0]];
      return { n: i + 1, expression: item.text, example: item.example, meanings: options, key: at };
    });
    const answers = await generateJson({ model: CHECK_MODEL, system: CHECK_SYSTEM, prompt: JSON.stringify(views.map((v) => Object.fromEntries(Object.entries(v).filter(([name]) => name !== "key"))), null, 1), schema: CHECK_SCHEMA });
    const byN = new Map((answers.answers ?? []).map((a) => [a.n, a]));
    const disputes = [];
    for (const view of views) {
      const item = batch[view.n - 1];
      const answer = byN.get(view.n);
      const key = textKey(item.text);
      if (!answer) file.check.results[key] = { status: "drop", note: "No answer from the checker." };
      else if (!answer.natural) file.check.results[key] = { status: "drop", note: "Judged unnatural." };
      else if (answer.level === "A1" || answer.level === "A2") file.check.results[key] = { status: "drop", note: `Too basic (${answer.level}).` };
      else if (answer.choice === view.key) file.check.results[key] = { status: "pass", level: answer.level };
      else disputes.push({ view, item, chosen: view.meanings[answer.choice] ?? "", level: answer.level });
    }
    if (disputes.length) {
      const verdicts = await generateJson({
        model: JUDGE_MODEL,
        system: JUDGE_SYSTEM,
        prompt: JSON.stringify(disputes.map((d, i) => ({ n: i + 1, expression: d.item.text, example: d.item.example, key: d.item.meaning, other: d.chosen })), null, 1),
        schema: JUDGE_SCHEMA,
      });
      const byV = new Map((verdicts.verdicts ?? []).map((v) => [v.n, v]));
      disputes.forEach((d, i) => {
        const verdict = byV.get(i + 1);
        file.check.results[textKey(d.item.text)] = verdict?.keyCorrect ? { status: "pass", level: d.level, note: `Checker slip: ${verdict.note}` } : { status: "drop", note: `Meaning judged wrong: ${verdict?.note ?? "no verdict"}` };
      });
    }
  }
  return file;
}

const jobs = [];
for (const level of PHRASE_LEVELS) {
  if (onlyLevel && onlyLevel !== level) continue;
  for (const situation of SITUATIONS) {
    if (onlySituation && onlySituation !== situation[0]) continue;
    jobs.push({ level, situation });
  }
}

let passed = 0;
let total = 0;
const failed = [];
await pool(jobs, 6, async (job, i) => {
  try {
    await runJob(job, i);
  } catch (error) {
    failed.push(`${job.level} ${job.situation[0]}: ${error.message}`);
  }
});

async function runJob(job, i) {
  const dir = join(CONTENT_DIR, "phrases", job.level.toLowerCase());
  const path = join(dir, `${job.situation[0]}.json`);
  let file = await draft(job.level, job.situation, path);
  file = await check(file);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
  const items = file.rounds.flatMap((r) => r.items);
  const ok = items.filter((item) => file.check.results[textKey(item.text)]?.status === "pass").length;
  passed += ok;
  total += items.length;
  process.stdout.write(`\r${i + 1}/${jobs.length} ${job.level} ${job.situation[0]}: ${ok}/${items.length}`.padEnd(70));
}
console.log(`\n${passed} of ${total} phrases passed; Gemini ${JSON.stringify(geminiStats())}`);
if (failed.length) {
  console.error(`Failed:\n  ${failed.join("\n  ")}`);
  process.exitCode = 1;
}
