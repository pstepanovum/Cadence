#!/usr/bin/env node
// The blind check: a second Gemini pass answers every generated exercise
// without seeing the key. Where it disagrees, a stronger model judges both the
// key and the other answer: a wrong key or an ambiguous question is dropped, a
// second correct answer is added to the accepted list, a checker slip is kept.
// When fewer than MIN_EXERCISES pass, new exercises are drafted and checked
// the same way. Nothing reaches a pack without passing.
//
//   node scripts/content/check.mjs [--level B1] [--only gp-slug]
//
// Results are written into each content/grammar/<level>/<slug>.json under
// `check`; build.mjs ships only exercises whose status is pass or fixed.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHECK_MODEL, generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { GRAMMAR_SCHEMA, GRAMMAR_SYSTEM, grammarPrompt, toContent } from "./lib/grammar-gen.mjs";
import { fitSummary, repairExercise } from "./lib/repair.mjs";
import { exerciseKey } from "./lib/validators.mjs";
import { blindView, fromBlindAnswer, judgeView, shuffleFor } from "./lib/blind.mjs";
import { OUTLINE, TOPICS } from "./data/grammar-outline.mjs";
import { gradeExercise, normalizeAnswer, validateExercise } from "../../src/lib/platform/content-model.ts";

export const MIN_EXERCISES = 12;
const JUDGE_MODEL = process.env.CONTENT_JUDGE_MODEL ?? "gemini-3.5-flash";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          choice: { type: "integer" },
          gaps: { type: "array", items: { type: "string" } },
          tokens: { type: "array", items: { type: "string" } },
          text: { type: "string" },
          mapping: { type: "array", items: { type: "integer" } },
        },
        required: ["n"],
      },
    },
  },
  required: ["answers"],
};

const ANSWER_SYSTEM = `You are an expert in English grammar taking a test. Answer every item.
- choose: give "choice", the 0-based index of the correct option.
- fill: give "gaps", one string per ___ gap, in order (only the missing words).
- order: give "tokens", every given token except words that do not belong, in the correct order.
- correct: give "text", the whole sentence with its one mistake corrected and nothing else changed.
- rewrite: give "text", the rewritten sentence following the instruction, keeping the meaning.
- match: give "mapping", for each left item (in order) the 0-based index of its right item.
Return one answer per item with its number n.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, keyCorrect: { type: "boolean" }, otherCorrect: { type: "boolean" }, note: { type: "string" } },
        required: ["n", "keyCorrect", "otherCorrect", "note"],
      },
    },
  },
  required: ["verdicts"],
};

const JUDGE_SYSTEM = `You are a careful English grammar examiner reviewing test items written for learners.
For each item you get the task, the answer key and another answer.
- keyCorrect: true only if the key is a fully correct, natural answer to the task as written.
- otherCorrect: true only if the other answer is also a fully correct, natural answer to the same task (for choose and match items: whether that other choice is also defensible, which would make the item ambiguous).
Judge standard modern English (American or British both acceptable). Be strict about grammar and about following the instruction.
note: one short sentence.`;

/** Exercises that may ship: pass or fixed, valid on their own. */
export function passing(file) {
  const all = [...file.exercises, ...(file.check?.extra ?? [])];
  return all.filter((e) => ["pass", "fixed"].includes(file.check?.results?.[e.id]?.status) && validateExercise(e).length === 0);
}

async function answerBlind(exercises, label) {
  const items = exercises.map((e, i) => blindView(e, i + 1));
  const result = await generateJson({
    model: CHECK_MODEL,
    system: ANSWER_SYSTEM,
    prompt: `${label}\n\n${JSON.stringify(items, null, 1)}`,
    schema: ANSWER_SCHEMA,
  });
  const byN = new Map((result.answers ?? []).map((a) => [a.n, a]));
  return exercises.map((e, i) => fromBlindAnswer(e, byN.get(i + 1)));
}

async function judge(disputes) {
  if (disputes.length === 0) return [];
  const items = disputes.map((d, i) => ({ n: i + 1, ...judgeView(d.exercise, d.answer) }));
  const result = await generateJson({ model: JUDGE_MODEL, system: JUDGE_SYSTEM, prompt: JSON.stringify(items, null, 1), schema: JUDGE_SCHEMA });
  const byN = new Map((result.verdicts ?? []).map((v) => [v.n, v]));
  return disputes.map((_, i) => byN.get(i + 1));
}

/** Adds a second correct answer to the key, where the kind allows it. */
function widenKey(exercise, answer) {
  const e = structuredClone(exercise);
  switch (e.kind) {
    case "gap_fill":
      e.answers = e.answers.map((accepted, i) => {
        const given = answer.gaps?.[i];
        return given && !accepted.some((a) => normalizeAnswer(a) === normalizeAnswer(given)) ? [...accepted, given] : accepted;
      });
      return e;
    case "error_correction":
    case "transformation":
      e.answers = [...e.answers, answer.text];
      return e;
    case "sentence_building":
      e.alternatives = [...(e.alternatives ?? []), answer.tokens];
      return e;
    default:
      return null;
  }
}

async function checkSet(exercises, label) {
  const results = {};
  const fixedExercises = new Map();
  const answers = await answerBlind(exercises, label);
  const disputes = [];
  exercises.forEach((e, i) => {
    const answer = answers[i];
    if (!answer) {
      disputes.push({ exercise: e, answer: null });
      return;
    }
    const grade = gradeExercise(e, answer);
    if (grade.correct) results[e.id] = { status: "pass" };
    else disputes.push({ exercise: e, answer });
  });
  const verdicts = await judge(disputes.filter((d) => d.answer));
  let v = 0;
  for (const d of disputes) {
    if (!d.answer) {
      results[d.exercise.id] = { status: "drop", note: "The checker gave no usable answer." };
      continue;
    }
    const verdict = verdicts[v++];
    if (!verdict) {
      results[d.exercise.id] = { status: "drop", note: "No verdict." };
    } else if (!verdict.keyCorrect) {
      results[d.exercise.id] = { status: "drop", note: `Key judged wrong: ${verdict.note}` };
    } else if (!verdict.otherCorrect) {
      results[d.exercise.id] = { status: "pass", note: `Checker slip: ${verdict.note}` };
    } else {
      const widened = widenKey(d.exercise, d.answer);
      if (widened && validateExercise(widened).length === 0) {
        fixedExercises.set(d.exercise.id, widened);
        results[d.exercise.id] = { status: "fixed", note: `Second answer accepted: ${verdict.note}` };
      } else {
        results[d.exercise.id] = { status: "drop", note: `Ambiguous: ${verdict.note}` };
      }
    }
  }
  return { results, fixedExercises };
}

const topicTitle = new Map(TOPICS.map((t) => [t.id, t.title]));
function jobFor(file) {
  const list = OUTLINE[file.level];
  const row = list.find((r) => r[0] === file.slug);
  const siblings = list.filter((o) => o[1] === row[1] && o[0] !== row[0]).map((o) => o[2]);
  return { level: file.level, slug: row[0], topicId: `topic.${row[1]}`, title: row[2], brief: row[3], siblings, topicTitle: topicTitle.get(`topic.${row[1]}`) };
}

async function topUp(file, round, need) {
  // Ask for a fresh draft with a round marker; keep only its exercises.
  const job = jobFor(file);
  const prompt = `${grammarPrompt(job)}\nWrite new exercises, different from these (round ${round}):\n${[...file.exercises, ...(file.check?.extra ?? [])]
    .map((e) => `- ${e.question ?? e.text ?? e.sentence ?? e.source ?? (e.answer ?? []).join(" ") ?? ""}`)
    .join("\n")}`;
  const draft = await generateJson({ system: GRAMMAR_SYSTEM, prompt, schema: GRAMMAR_SCHEMA });
  const fresh = toContent(job, draft).exercises;
  const used = new Set([...file.exercises, ...(file.check?.extra ?? [])].map((e) => e.id));
  let next = used.size + 1;
  return fresh.slice(0, Math.max(need + 2, 4)).map((e) => {
    let id;
    do {
      id = `ex.${file.level.toLowerCase()}.${file.slug}.${String(next++).padStart(2, "0")}`;
    } while (used.has(id));
    return { ...e, id };
  });
}

const files = [];
for (const level of Object.keys(OUTLINE)) {
  if (flag("--level") && flag("--level") !== level) continue;
  const dir = join(CONTENT_DIR, "grammar", level.toLowerCase());
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    continue;
  }
  for (const name of names) {
    if (flag("--only") && name !== `${flag("--only")}.json`) continue;
    files.push(join(dir, name));
  }
}

let shipped = 0;
let dropped = 0;
let fixed = 0;
await pool(files, 4, async (path, i) => {
  const file = JSON.parse(readFileSync(path, "utf8"));
  const check = file.check ?? { model: CHECK_MODEL, judge: JUDGE_MODEL, results: {}, extra: [] };
  file.check = check;
  // Repairs first; whatever is still invalid is dropped before any checking.
  file.grammarPoint.summary = fitSummary(file.grammarPoint.summary);
  file.exercises = file.exercises.map(repairExercise);
  check.extra = check.extra.map(repairExercise);
  for (const e of [...file.exercises, ...check.extra]) {
    const invalid = validateExercise(e);
    if (invalid.length) check.results[e.id] = { status: "drop", note: `Invalid: ${invalid.join("; ")}` };
  }
  const keys = new Set();
  for (const e of [...file.exercises, ...check.extra]) {
    if (check.results[e.id]?.status === "drop") continue;
    const key = exerciseKey(e);
    if (keys.has(key)) check.results[e.id] = { status: "drop", note: "Duplicate of an earlier exercise." };
    keys.add(key);
  }
  const unchecked = file.exercises.filter((e) => !check.results[e.id]);
  if (unchecked.length) {
    const { results, fixedExercises } = await checkSet(shuffleFor(unchecked, file.slug), `${file.level} grammar point: ${file.grammarPoint.title}`);
    Object.assign(check.results, results);
    file.exercises = file.exercises.map((e) => fixedExercises.get(e.id) ?? e);
  }
  for (let round = 1; round <= 3 && passing(file).length < MIN_EXERCISES; round += 1) {
    const extra = await topUp(file, round, MIN_EXERCISES - passing(file).length);
    const { results, fixedExercises } = await checkSet(extra, `${file.level} grammar point: ${file.grammarPoint.title}`);
    Object.assign(check.results, results);
    check.extra = [...check.extra, ...extra.map((e) => fixedExercises.get(e.id) ?? e)];
  }
  check.results = Object.fromEntries(Object.entries(check.results).sort(([a], [b]) => a.localeCompare(b)));
  const statuses = Object.values(check.results).map((r) => r.status);
  shipped += passing(file).length;
  dropped += statuses.filter((s) => s === "drop").length;
  fixed += statuses.filter((s) => s === "fixed").length;
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
  process.stdout.write(`\r${i + 1}/${files.length} ${file.level} ${file.slug} ${passing(file).length} pass`.padEnd(80));
});
console.log(`\nshipped ${shipped}, fixed ${fixed}, dropped ${dropped}; Gemini ${JSON.stringify(geminiStats())}`);
