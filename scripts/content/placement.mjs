#!/usr/bin/env node
// The placement bank: written items per CEFR level, in seven kinds (grammar in
// context, gap fill, error spotting, sentence transformation, word order,
// collocation and reading in context), drafted with Gemini in our own words,
// then put through the same blind check as the grammar exercises and a level
// check: a second model rates each item's CEFR level, and an item rated more
// than one level away from its band is dropped. Nothing reaches the
// `placement` pack without passing both.
//
//   node scripts/content/placement.mjs [--level C1] [--type error]
//
// Writes content/placement/<level>.json. Responses are cached by prompt, so a
// rerun only calls the API for what changed. The adaptive test that uses the
// bank is src/lib/platform/placement.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLACEMENT_PROMPTS, PLACEMENT_TYPES, THEMES, grammarFocus, readingFocus, vocabularyFocus } from "./data/placement-plan.mjs";
import { checkSet } from "./lib/blind-check.mjs";
import { shuffleFor } from "./lib/blind.mjs";
import { CHECK_MODEL, generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { passingItems, placementFile, ratingFits } from "./lib/placement-bank.mjs";
import { repairExercise } from "./lib/repair.mjs";
import { LEVELS, isSensitive, levelIndex } from "./lib/text.mjs";
import { exerciseKey } from "./lib/validators.mjs";
import { gradeExercise, normalizeAnswer, validateExercise } from "../../src/lib/platform/content-model.ts";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyLevel = flag("--level");
const onlyType = flag("--type");
const MAX_ROUNDS = 3;

const STR = { type: "string" };
const STR_LIST = { type: "array", items: STR };
const EXPLANATION = "explanation: one sentence under 160 characters saying why the answer is right.";

const SYSTEM = `You write items for Cadence's English placement test, taken by adults, many of them advanced professionals and exam candidates (IELTS, TOEFL, Cambridge).
Write everything yourself in clear, modern English (American spelling). Never copy from textbooks, exams, dictionaries or published course material, and never mention them.
Every item must have exactly one correct answer (or list every acceptable typed answer), be unambiguous to an educated native speaker, and measure the stated CEFR level: an item at a level should be answered correctly by most learners at that level and by few learners a level below.
Wrong options must be plausible to a learner below the level, but clearly wrong to an expert. Never make the right answer the longest option by habit; vary its position.
Adult topics, varied names, places and settings. Nothing childish, offensive, political, religious, sexual, violent, or about real living people or brands.
${EXPLANATION}`;

function typeBrief(type, level) {
  const grammar = `Test these structures across the set, one per item, no two items testing the same thing in the same way: ${grammarFocus(level).join("; ")}.`;
  switch (type) {
    case "grammar":
      return `Grammar in context. question: one sentence (or a two-line exchange) with exactly one ___ gap; options: 4 short options; answer: the index of the only correct option. ${grammar}`;
    case "gap":
      return `Typed gap fill. text: one sentence with exactly one ___ gap that needs one to three words; answers: a list with ONE inner list of every acceptable answer for that gap (contracted and full forms where both work). The context must allow only that answer. ${grammar}`;
    case "error":
      return `Error spotting. segments: the sentence split into exactly 4 consecutive parts that join with single spaces into the whole sentence; exactly one part contains one grammar or usage mistake, the other three are correct; answer: the index of the wrong part. Make the mistake one a learner below the level would miss. ${grammar}`;
    case "transform":
      return `Sentence transformation, like a key word transformation. source: a sentence; instruction: what to do, either "Use the word '<word>'." or "Begin with '<words>'."; answers: every acceptable rewritten sentence that keeps the meaning exactly (list several where the wording can vary). ${grammar}`;
    case "order":
      return `Word order. tokens: a correct sentence of ${levelIndex(level) < 2 ? "4 to 9" : levelIndex(level) < 4 ? "6 to 12" : "7 to 15"} words split into tokens (one word per token, final punctuation joined to the last word); alternatives: any other fully correct orders of the same tokens; distractors: 0 to 2 wrong words not in the sentence. The order must test a structure, not just meaning. ${grammar}`;
    case "collocation":
      return `Collocation and word choice. question: one sentence with exactly one ___ gap where only one word fits idiomatically; options: 4 single words or short phrases of the same type; answer: the index of the only natural choice. Focus: ${vocabularyFocus(level)}.`;
    case "reading":
      return `Reading in context. passage: ${readingFocus(level)}, at most ${levelIndex(level) >= 3 ? 400 : 160} characters; question: at most 70 characters; options: 4 short options; answer: the index of the only answer the passage supports. Focus on what the level tests: ${readingFocus(level)}.`;
    default:
      throw new Error(`unknown type ${type}`);
  }
}

const ITEM_FIELDS = {
  grammar: { question: STR, options: STR_LIST, answer: { type: "integer" } },
  gap: { text: STR, answers: { type: "array", items: STR_LIST } },
  error: { segments: STR_LIST, answer: { type: "integer" } },
  transform: { source: STR, instruction: STR, answers: STR_LIST },
  order: { tokens: STR_LIST, alternatives: { type: "array", items: STR_LIST }, distractors: STR_LIST },
  collocation: { question: STR, options: STR_LIST, answer: { type: "integer" } },
  reading: { passage: STR, question: STR, options: STR_LIST, answer: { type: "integer" } },
};
const REQUIRED = {
  grammar: ["question", "options", "answer"],
  gap: ["text", "answers"],
  error: ["segments", "answer"],
  transform: ["source", "instruction", "answers"],
  order: ["tokens"],
  collocation: ["question", "options", "answer"],
  reading: ["passage", "question", "options", "answer"],
};

const schemaFor = (type) => ({
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { ...ITEM_FIELDS[type], focus: STR, explanation: STR }, required: [...REQUIRED[type], "focus", "explanation"] },
    },
  },
  required: ["items"],
});

/** A drafted item as a content-model exercise, or null when it cannot be one. */
function toExercise(type, level, raw, id) {
  const base = { id, level, grammarPointIds: [], prompt: PLACEMENT_PROMPTS[type], explanation: String(raw.explanation ?? "").trim().slice(0, 300) };
  switch (type) {
    case "grammar":
    case "collocation":
      return { ...base, kind: "multiple_choice", question: raw.question, options: raw.options, answer: raw.answer };
    case "reading":
      return { ...base, kind: "multiple_choice", passage: String(raw.passage ?? "").trim(), question: String(raw.question ?? "").trim(), options: raw.options, answer: raw.answer };
    case "error": {
      const segments = (raw.segments ?? []).map((s) => String(s).trim()).filter(Boolean);
      if (segments.length !== 4) return null;
      return { ...base, kind: "multiple_choice", question: segments.join(" "), options: segments, answer: raw.answer };
    }
    case "gap":
      return { ...base, kind: "gap_fill", text: raw.text, answers: raw.answers };
    case "transform":
      return { ...base, kind: "transformation", source: raw.source, instruction: raw.instruction, answers: raw.answers };
    case "order":
      return {
        ...base,
        kind: "sentence_building",
        answer: raw.tokens,
        ...(raw.alternatives?.length ? { alternatives: raw.alternatives } : {}),
        ...(raw.distractors?.length ? { distractors: raw.distractors } : {}),
      };
    default:
      return null;
  }
}

/** Problems the shared validator does not catch for placement items. */
function itemProblems(type, e) {
  const p = [...validateExercise(e)];
  if (e.kind === "multiple_choice") {
    if (!Number.isInteger(e.answer) || e.answer < 0 || e.answer >= e.options.length) p.push("answer out of range");
    if (new Set(e.options.map(normalizeAnswer)).size !== e.options.length) p.push("repeated option");
    if (type !== "error" && type !== "reading" && (e.question.split("___").length - 1 !== 1)) p.push("needs exactly one gap");
  }
  if (e.kind === "gap_fill" && e.answers.length !== 1) p.push("needs exactly one gap");
  if (e.kind === "transformation" && e.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(e.source))) p.push("an answer repeats the source");
  if (isSensitive(JSON.stringify(e))) p.push("sensitive topic");
  try {
    const key = e.kind === "multiple_choice" ? { kind: e.kind, choice: e.answer } : e.kind === "gap_fill" ? { kind: e.kind, gaps: e.answers.map((a) => a[0]) } : e.kind === "sentence_building" ? { kind: e.kind, tokens: e.answer } : { kind: e.kind, text: e.answers[0] };
    if (!gradeExercise(e, key).correct) p.push("key does not grade as correct");
  } catch (error) {
    p.push(`grading failed: ${error.message}`);
  }
  return p;
}

const RATE_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, level: { type: "string", enum: LEVELS } }, required: ["n", "level"] } } },
  required: ["items"],
};
const RATE_SYSTEM = `You are an experienced CEFR test designer. For each placement test item, give the CEFR level (A1 to C2) at which a typical learner first answers it correctly most of the time. Judge the hardest thing the item requires (structure, vocabulary, inference), not the topic.`;

/** The level a second model gives each item, by id. */
async function rateLevels(exercises) {
  if (exercises.length === 0) return {};
  // The key and the band stay hidden from the rater.
  const hidden = new Set(["id", "level", "grammarPointIds", "explanation"]);
  const items = exercises.map((e, i) => ({ n: i + 1, ...Object.fromEntries(Object.entries(e).filter(([key]) => !hidden.has(key))) }));
  const result = await generateJson({ model: CHECK_MODEL, system: RATE_SYSTEM, prompt: JSON.stringify(items, null, 1), schema: RATE_SCHEMA });
  const byN = new Map((result.items ?? []).map((r) => [r.n, r.level]));
  return Object.fromEntries(exercises.map((e, i) => [e.id, byN.get(i + 1) ?? null]));
}

const BLIND_LABEL = {
  grammar: "Placement items. choose: pick the option that correctly fills the ___ gap.",
  gap: "Placement items. fill: type the missing word or words for the ___ gap.",
  error: "Placement items. choose: each sentence is split into four parts given as options; exactly one part contains a mistake. Give the index of the wrong part.",
  transform: "Placement items. rewrite: rewrite the sentence following the instruction, keeping the meaning exactly.",
  order: "Placement items. order: put the tokens into a correct sentence; leave out any word that does not belong.",
  collocation: "Placement items. choose: pick the option that fits the ___ gap most naturally.",
  reading: "Placement items. choose: read the passage and pick the only answer it supports.",
};

function draftPrompt(type, level, batch, round, existing) {
  const spec = PLACEMENT_TYPES[type];
  return [
    `CEFR level: ${level}`,
    `Item type: ${spec.title}`,
    typeBrief(type, level),
    `Write ${spec.draft} items. Spread them over these themes: ${THEMES[batch % THEMES.length].join(", ")}.`,
    `focus: a few words naming exactly what the item tests.`,
    round > 0 || existing.length
      ? `Every item must be new: no sentence, structure-and-context pair or passage like any of these (round ${round}):\n${existing.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const describe = (e) => e.question ?? e.text ?? e.source ?? (e.answer ?? []).join(" ");

function readBank(level) {
  const file = placementFile(level);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  return { format: 1, level, items: [], check: { model: CHECK_MODEL, results: {}, ratings: {} } };
}

async function runType(bank, type) {
  const level = bank.level;
  const spec = PLACEMENT_TYPES[type];
  const prefix = `ex.placement.${level.toLowerCase()}.${type}`;
  const passingOfType = () => passingItems(bank).filter((item) => item.type === type).length;
  const keys = new Set(bank.items.map((item) => exerciseKey(item.exercise)));
  let next = bank.items.filter((item) => item.type === type).length + 1;

  for (let round = 0; round <= MAX_ROUNDS && passingOfType() < spec.target; round += 1) {
    const existing = bank.items.filter((item) => item.type === type).map((item) => describe(item.exercise));
    const batches = round === 0 && existing.length === 0 ? [0, 1] : [round % 2];
    const drafted = [];
    for (const batch of batches) {
      const draft = await generateJson({ system: SYSTEM, prompt: draftPrompt(type, level, batch, round, existing), schema: schemaFor(type) });
      for (const raw of draft.items ?? []) {
        const id = `${prefix}.${String(next).padStart(2, "0")}`;
        const exercise = toExercise(type, level, raw, id);
        if (!exercise) continue;
        const repaired = repairExercise(exercise);
        const key = exerciseKey(repaired);
        if (keys.has(key)) continue;
        keys.add(key);
        next += 1;
        drafted.push({ type, focus: String(raw.focus ?? "").slice(0, 80), exercise: repaired });
      }
    }
    const valid = [];
    for (const item of drafted) {
      const problems = itemProblems(type, item.exercise);
      if (problems.length) bank.check.results[item.exercise.id] = { status: "drop", note: `Invalid: ${problems.join("; ")}` };
      else valid.push(item);
    }
    const exercises = valid.map((item) => item.exercise);
    const { results, fixedExercises } = await checkSet(shuffleFor(exercises, `${level}:${type}:${round}`), BLIND_LABEL[type]);
    Object.assign(bank.check.results, results);
    const ratings = await rateLevels(exercises.filter((e) => ["pass", "fixed"].includes(results[e.id]?.status)));
    for (const [id, rated] of Object.entries(ratings)) {
      bank.check.ratings[id] = rated;
      if (!ratingFits(level, rated)) bank.check.results[id] = { status: "drop", note: `Rated ${rated ?? "unknown"}, outside the ${level} band.` };
    }
    for (const item of drafted) item.exercise = fixedExercises.get(item.exercise.id) ?? item.exercise;
    bank.items.push(...drafted);
  }
}

const levels = LEVELS.filter((level) => !onlyLevel || level === onlyLevel);
const types = Object.keys(PLACEMENT_TYPES).filter((type) => !onlyType || type === onlyType);

await pool(levels, 3, async (level) => {
  const bank = readBank(level);
  await pool(types, 4, (type) => runType(bank, type));
  bank.items.sort((a, b) => a.exercise.id.localeCompare(b.exercise.id, "en", { numeric: true }));
  bank.check.results = Object.fromEntries(Object.entries(bank.check.results).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
  bank.check.ratings = Object.fromEntries(Object.entries(bank.check.ratings).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
  mkdirSync(join(CONTENT_DIR, "placement"), { recursive: true });
  writeFileSync(placementFile(level), `${JSON.stringify(bank, null, 1)}\n`);
  const counts = Object.fromEntries(Object.keys(PLACEMENT_TYPES).map((type) => [type, passingItems(bank).filter((item) => item.type === type).length]));
  console.log(`${level}: ${passingItems(bank).length} pass of ${bank.items.length} ${JSON.stringify(counts)}`);
});
console.log(`Gemini ${JSON.stringify(geminiStats())}`);
