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
import { JUDGE_MODEL, checkSet } from "./lib/blind-check.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { GRAMMAR_SCHEMA, GRAMMAR_SYSTEM, grammarPrompt, toContent } from "./lib/grammar-gen.mjs";
import { fitSummary, repairExercise } from "./lib/repair.mjs";
import { exerciseKey } from "./lib/validators.mjs";
import { shuffleFor } from "./lib/blind.mjs";
import { OUTLINE, TOPICS } from "./data/grammar-outline.mjs";
import { validateExercise } from "../../src/lib/platform/content-model.ts";

export const MIN_EXERCISES = 12;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Exercises that may ship: pass or fixed, valid on their own. */
export function passing(file) {
  const all = [...file.exercises, ...(file.check?.extra ?? [])];
  return all.filter((e) => ["pass", "fixed"].includes(file.check?.results?.[e.id]?.status) && validateExercise(e).length === 0);
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
