#!/usr/bin/env node
// Drill material for the plateau track (docs/PLATFORM.md section 18), one
// file per persistent error in data/fossilization-plan.mjs, drafted with
// Gemini in our own words:
//
//   contrasts   wrong and right versions of one sentence, with a short note
//   drills      correct sentences dense in the target, to say aloud
//   probes      for the diagnostic and the weekly re-tests: a sentence with the
//               error to correct (grammar, word choice), or a sentence to read
//               aloud and be scored on (pronunciation, stress, intonation)
//   pairs       minimal pairs (pronunciation)
//   stress      sentences with the stressed syllables in capitals (stress, intonation)
//
// The blind check: a checker corrects every wrong sentence and every probe
// without the key, and a judge reads every drill sentence; anything the judge
// rejects, and any correction that disagrees with the key unless the judge
// accepts both, is dropped.
//
//   node scripts/content/fossilization.mjs [--only th-sounds [--salt 2]]
//
// Writes content/fossilization/<slug>.json.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FOSSIL_ERRORS } from "./data/fossilization-plan.mjs";
import { CHECK_MODEL, generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { JUDGE_MODEL } from "./lib/blind-check.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { isSensitive, profanityIn } from "./lib/text.mjs";
import { normalizeAnswer } from "../../src/lib/platform/content-model.ts";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
// A new draft for one error whose first one lost too much in the check.
const salt = args.includes("--salt") ? args[args.indexOf("--salt") + 1] : "";

const SYSTEM = `You write corrective speaking drills for adult learners at C1 and C2 whose English is fluent but has a few fossilized errors: mistakes so familiar that they no longer notice them. The tone is precise and respectful, never childish. Every sentence is about adult life (work, study, travel, family, money, ideas). Write in your own words.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    listenFor: { type: "string" },
    contrasts: { type: "array", items: { type: "object", properties: { wrong: { type: "string" }, right: { type: "string" }, note: { type: "string" } }, required: ["wrong", "right", "note"] } },
    drills: { type: "array", items: { type: "string" } },
    probes: { type: "array", items: { type: "object", properties: { sentence: { type: "string" }, answer: { type: "string" } }, required: ["sentence", "answer"] } },
    pairs: { type: "array", items: { type: "array", items: { type: "string" } } },
    stress: { type: "array", items: { type: "object", properties: { text: { type: "string" }, marked: { type: "string" }, note: { type: "string" } }, required: ["text", "marked", "note"] } },
  },
  required: ["summary", "listenFor", "contrasts", "drills", "probes", "pairs", "stress"],
};

const spokenArea = (area) => area === "pronunciation" || area === "stress" || area === "intonation";

function prompt([, area, title, what]) {
  const written = !spokenArea(area);
  return `Persistent error: ${title}. What goes wrong: ${what}.

Write:
- summary: two sentences, at most 300 characters: why this error survives at an advanced level and what it costs the speaker.
- listenFor: one sentence, at most 140 characters, on what to notice in your own speech.
- contrasts: 6 pairs. ${written ? "wrong: a natural sentence containing exactly this one error; right: the same sentence corrected, nothing else changed;" : "wrong: how the sentence comes out with the error, described in words in brackets after the sentence is not allowed, so write the sentence the way a listener would hear it (e.g. 'I tink so' for TH); right: the correct sentence;"} note: why, at most 100 characters.
- drills: 10 correct sentences, 6 to 18 words each, dense in the target (${written ? "the correct form used naturally" : "many instances of the target sounds or patterns"}), to be said aloud.
- probes: ${written ? "6 sentences each containing exactly this one error (sentence) and the corrected sentence (answer), different from the contrasts" : "6 sentences to read aloud, dense in the target (sentence), with answer equal to sentence"}.
- pairs: ${area === "pronunciation" ? "10 minimal pairs of common words that differ only in the target sounds, as two-word arrays" : "an empty array"}.
- stress: ${area === "stress" || area === "intonation" ? "8 items: text is a natural sentence; marked is the same sentence with the syllables that carry the main stress in CAPITALS (only those); note says why, at most 100 characters" : "an empty array"}.`;
}

const CHECK_SYSTEM = `You are an expert English teacher. Each item is a sentence that contains exactly one mistake. Return the sentence corrected with the smallest change, nothing else changed.`;
const CHECK_SCHEMA = { type: "object", properties: { answers: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, text: { type: "string" } }, required: ["n", "text"] } } }, required: ["answers"] };

const JUDGE_SYSTEM = `You are a strict examiner of standard modern English (American or British). For each item:
- if it has "sentence" only: ok is true when the sentence is grammatical, natural and something a fluent speaker would say.
- if it has "key" and "other": ok is true when the key is a correct correction; alsoOk is true when the other correction is also fully correct.`;
const JUDGE_SCHEMA = {
  type: "object",
  properties: { verdicts: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, ok: { type: "boolean" }, alsoOk: { type: "boolean" } }, required: ["n", "ok", "alsoOk"] } } },
  required: ["verdicts"],
};

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const clean = (s) => !profanityIn(s).length && !isSensitive(s) && s.length <= 220;

async function build(entry) {
  const [slug, area, title, what, grammarPointIds, soundIds] = entry;
  const draft = await generateJson({ system: SYSTEM, prompt: prompt(entry) + (salt ? `\n\n(Draft ${salt}: write fresh sentences; every wrong sentence must contain the error unmistakably.)` : ""), schema: SCHEMA });
  const written = !spokenArea(area);
  let contrasts = (draft.contrasts ?? []).map((c) => ({ wrong: tidy(c.wrong), right: tidy(c.right), note: tidy(c.note) })).filter((c) => c.wrong && c.right && normalizeAnswer(c.wrong) !== normalizeAnswer(c.right) && clean(c.wrong) && clean(c.right));
  let probes = (draft.probes ?? []).map((p) => ({ sentence: tidy(p.sentence), answer: tidy(written ? p.answer : p.sentence) })).filter((p) => p.sentence && clean(p.sentence) && (!written || normalizeAnswer(p.sentence) !== normalizeAnswer(p.answer)));
  let drills = [...new Set((draft.drills ?? []).map(tidy))].filter((d) => d && clean(d));
  const pairs = area === "pronunciation" ? (draft.pairs ?? []).map((p) => p.map(tidy)).filter((p) => p.length === 2 && p[0] && p[1] && p[0].toLowerCase() !== p[1].toLowerCase() && !p.some((w) => w.includes(" "))) : [];
  const stress = area === "stress" || area === "intonation" ? (draft.stress ?? []).map((s) => ({ text: tidy(s.text), marked: tidy(s.marked), note: tidy(s.note) })).filter((s) => s.text && s.marked.toLowerCase() === s.text.toLowerCase() && /[A-Z]{2}/.test(s.marked)) : [];

  // Blind corrections of every wrong sentence and probe (written errors only),
  // and a judge for every disagreement and every sentence meant to be correct.
  const toCorrect = written ? [...contrasts.map((c, i) => ({ ref: `cc${i}`, text: c.wrong, key: c.right })), ...probes.map((p, i) => ({ ref: `pc${i}`, text: p.sentence, key: p.answer }))] : [];
  const corrections = new Map();
  if (toCorrect.length) {
    const result = await generateJson({ model: CHECK_MODEL, system: CHECK_SYSTEM, prompt: JSON.stringify(toCorrect.map((c, i) => ({ n: i + 1, sentence: c.text })), null, 1), schema: CHECK_SCHEMA });
    const byN = new Map((result.answers ?? []).map((a) => [a.n, a.text]));
    toCorrect.forEach((c, i) => corrections.set(c.ref, tidy(byN.get(i + 1))));
  }
  const judgeItems = [];
  for (const c of toCorrect) {
    const other = corrections.get(c.ref) ?? "";
    if (normalizeAnswer(other) !== normalizeAnswer(c.key)) judgeItems.push({ ref: c.ref, view: { original: c.text, key: c.key, other } });
  }
  drills.forEach((sentence, i) => judgeItems.push({ ref: `d${i}`, view: { sentence } }));
  contrasts.forEach((c, i) => judgeItems.push({ ref: `cs${i}`, view: { sentence: c.right } }));
  if (!written) probes.forEach((p, i) => judgeItems.push({ ref: `ps${i}`, view: { sentence: p.sentence } }));
  // A "wrong" sentence the judge finds perfectly fine teaches nothing.
  if (written) contrasts.forEach((c, i) => judgeItems.push({ ref: `cw${i}`, view: { sentence: c.wrong } }));
  if (written) probes.forEach((p, i) => judgeItems.push({ ref: `pw${i}`, view: { sentence: p.sentence } }));
  const verdicts = new Map();
  if (judgeItems.length) {
    const result = await generateJson({ model: JUDGE_MODEL, system: JUDGE_SYSTEM, prompt: JSON.stringify(judgeItems.map((j, i) => ({ n: i + 1, ...j.view })), null, 1), schema: JUDGE_SCHEMA });
    const byN = new Map((result.verdicts ?? []).map((v) => [v.n, v]));
    judgeItems.forEach((j, i) => verdicts.set(j.ref, byN.get(i + 1) ?? { ok: false, alsoOk: false }));
  }
  // No verdict means the checker agreed with the key, or nothing needed judging.
  const ok = (ref) => verdicts.get(ref)?.ok !== false;
  const flawed = (ref) => verdicts.get(ref)?.ok === false;
  const widened = (ref) => (verdicts.get(ref)?.ok && verdicts.get(ref)?.alsoOk ? [corrections.get(ref)] : []);
  drills = drills.filter((_, i) => ok(`d${i}`));
  contrasts = contrasts.filter((_, i) => ok(`cs${i}`) && (!written || (ok(`cc${i}`) && flawed(`cw${i}`))));
  probes = probes
    .map((p, i) => ({ ...p, keep: written ? ok(`pc${i}`) && flawed(`pw${i}`) : ok(`ps${i}`), answers: written ? [p.answer, ...widened(`pc${i}`)].filter(Boolean) : [] }))
    .filter((p) => p.keep)
    .map((p) => (written ? { sentence: p.sentence, answers: [...new Set(p.answers)] } : { sentence: p.sentence }));

  return {
    format: 1,
    id: `fossil.${slug}`,
    area,
    title,
    what,
    summary: tidy(draft.summary).slice(0, 320),
    listenFor: tidy(draft.listenFor).slice(0, 160),
    grammarPointIds,
    soundIds,
    contrasts,
    drills,
    probes,
    pairs,
    stress,
  };
}

const dir = join(CONTENT_DIR, "fossilization");
mkdirSync(dir, { recursive: true });
const jobs = FOSSIL_ERRORS.filter((e) => !only || e[0] === only);
await pool(jobs, 6, async (entry) => {
  const path = join(dir, `${entry[0]}.json`);
  if (existsSync(path) && !only) return;
  const file = await build(entry);
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
  console.log(`${entry[0]}: ${file.contrasts.length} contrasts, ${file.drills.length} drills, ${file.probes.length} probes, ${file.pairs.length} pairs, ${file.stress.length} stress`);
});
console.log(`Gemini ${JSON.stringify(geminiStats())}`);
