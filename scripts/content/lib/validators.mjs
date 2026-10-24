// Content checks beyond the shared model's own validator (docs/PLATFORM.md
// 3.2): answer keys grade as correct, no duplicates, CEFR coverage, profanity,
// length limits, Tatoeba attribution and the pack size budget.

import { gzipSync } from "node:zlib";
import { LEVELS, profanityIn, textKey } from "./text.mjs";
import { gradeExercise, validatePackContent } from "../../../src/lib/platform/content-model.ts";
import { ENGLISH_SOUNDS } from "../../../src/lib/platform/vocal-tract/index.ts";

export const BUDGET = { rawBytes: 1.5 * 1024 * 1024, gzipBytes: 300 * 1024 };
export const COVERAGE = {
  totalGrammarPoints: 120,
  grammarPointsPerLevel: { A2: 20, B1: 20, B2: 20, C1: 18, C2: 12 },
  exercisesPerGrammarPoint: 12,
  kindsPerGrammarPoint: 4,
  totalFlashcards: 3000,
  totalSentences: 5000,
  sentencesPerLevel: { A2: 800, B1: 800, B2: 800, C1: 800, C2: 600 },
};
export const LIMITS = { definition: 120, tatoebaSentence: 160 };

/** The answer the key itself gives, which must grade as correct. */
export function keyAnswer(e) {
  switch (e.kind) {
    case "multiple_choice":
      return { kind: e.kind, choice: e.answer };
    case "matching":
      return { kind: e.kind, mapping: e.pairs.map((_, i) => i) };
    case "gap_fill":
      return { kind: e.kind, gaps: e.answers.map((a) => a[0]) };
    case "sentence_building":
      return { kind: e.kind, tokens: e.answer };
    case "error_correction":
    case "transformation":
      return { kind: e.kind, text: e.answers[0] };
    case "dictation":
      return { kind: e.kind, text: e.text };
    case "minimal_pair":
      return { kind: e.kind, played: 0, choice: 0 };
    case "flashcard":
      return { kind: e.kind, grade: "good" };
    default:
      return null;
  }
}

/** Every human-readable string in an exercise, grammar point or example. */
export function textsOf(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => textsOf(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (["id", "kind", "level", "topicId", "audio", "grammarPointIds", "soundIds", "exerciseIds", "related", "author", "source"].includes(k)) continue;
      textsOf(v, out);
    }
  }
  return out;
}

/** The text that identifies an exercise for duplicate checks. */
export function exerciseKey(e) {
  switch (e.kind) {
    case "multiple_choice":
      return `mc:${textKey(e.question)}:${e.options.map(textKey).sort().join("|")}`;
    case "gap_fill":
      return `gap:${textKey(e.text)}`;
    case "sentence_building":
      return `sb:${textKey(e.answer.join(" "))}`;
    case "error_correction":
      return `ec:${textKey(e.sentence)}`;
    case "transformation":
      return `tr:${textKey(e.source)}:${textKey(e.instruction)}`;
    case "matching":
      return `m:${e.pairs.map((p) => textKey(p.left)).sort().join("|")}`;
    case "flashcard":
      return `fc:${textKey(e.front)}`;
    case "dictation":
      return `d:${textKey(e.text)}`;
    case "minimal_pair":
      return `mp:${e.words.map(textKey).sort().join("|")}`;
    default:
      return e.id;
  }
}

const soundIds = new Set(ENGLISH_SOUNDS.map((s) => s.id));

/** Problems inside one assembled pack. */
export function packProblems(pack) {
  const p = [];
  const content = pack.files["content.json"];
  p.push(...validatePackContent(content).map((x) => `${pack.id}: ${x}`));

  const seen = new Map();
  for (const e of content.exercises) {
    const answer = keyAnswer(e);
    if (!answer) p.push(`${e.id}: no key answer for kind ${e.kind}`);
    else {
      try {
        if (!gradeExercise(e, answer).correct) p.push(`${e.id}: its own key does not grade as correct`);
      } catch (error) {
        p.push(`${e.id}: grading failed (${error.message})`);
      }
    }
    if (e.kind === "gap_fill" && e.answers.some((list) => list.some((a) => /_{3}/.test(a)))) p.push(`${e.id}: an answer contains a gap`);
    if (e.kind === "multiple_choice" && /_{3}/.test(e.question) && e.options.some((o) => !o.trim())) p.push(`${e.id}: empty option`);
    if (e.kind === "flashcard" && e.back.length > LIMITS.definition + 20) p.push(`${e.id}: definition too long`);
    for (const id of e.soundIds ?? []) if (!soundIds.has(id)) p.push(`${e.id}: unknown sound ${id}`);
    const key = exerciseKey(e);
    if (seen.has(key)) p.push(`${e.id}: duplicates ${seen.get(key)}`);
    else seen.set(key, e.id);
  }

  const exampleKeys = new Map();
  for (const gp of content.grammarPoints) {
    if (gp.explanation.length > 1500) p.push(`${gp.id}: explanation over 1500 characters`);
    if (gp.patterns.length === 0) p.push(`${gp.id}: no patterns`);
    if (gp.commonErrors.length === 0) p.push(`${gp.id}: no common errors`);
    for (const ex of gp.examples) {
      const key = textKey(ex.text);
      if (exampleKeys.has(key)) p.push(`${gp.id}: example repeats one in ${exampleKeys.get(key)}`);
      exampleKeys.set(key, gp.id);
      if (ex.source?.kind === "tatoeba" && (!Number.isInteger(ex.source.sentenceId) || !ex.source.author)) p.push(`${gp.id}: Tatoeba example without id or author`);
    }
  }

  for (const [name, json] of Object.entries(pack.files)) {
    for (const text of textsOf(json)) {
      const bad = profanityIn(text);
      if (bad.length) p.push(`${pack.id}/${name}: profanity (${bad.join(", ")}) in "${text.slice(0, 60)}"`);
    }
  }

  const sentences = pack.files["sentences.json"]?.sentences ?? [];
  for (const s of sentences) {
    if (!Number.isInteger(s.sentenceId) || !s.author) p.push(`${pack.id}: sentence without id or author`);
    if (s.text.length > LIMITS.tatoebaSentence) p.push(`${pack.id}: sentence ${s.sentenceId} too long`);
  }

  const raw = JSON.stringify(content);
  const gz = gzipSync(raw).length;
  if (raw.length > BUDGET.rawBytes) p.push(`${pack.id}: content.json is ${(raw.length / 1024).toFixed(0)} KB raw, over 1.5 MB`);
  if (gz > BUDGET.gzipBytes) p.push(`${pack.id}: content.json is ${(gz / 1024).toFixed(0)} KB gzip, over 300 KB`);
  return p;
}

/** Problems across all packs: cross-pack duplicates and CEFR coverage. */
export function corpusProblems(packs) {
  const p = [];
  const ids = new Map();
  const keys = new Map();
  const sentenceIds = new Map();
  for (const pack of packs) {
    const content = pack.files["content.json"];
    for (const item of [...content.grammarPoints, ...content.lessons, ...content.exercises]) {
      if (ids.has(item.id) && ids.get(item.id) !== pack.id) p.push(`${item.id}: in both ${ids.get(item.id)} and ${pack.id}`);
      ids.set(item.id, pack.id);
    }
    for (const e of content.exercises) {
      const key = exerciseKey(e);
      if (keys.has(key) && keys.get(key) !== pack.id) p.push(`${e.id}: duplicates an exercise in ${keys.get(key)}`);
      keys.set(key, pack.id);
    }
    for (const s of pack.files["sentences.json"]?.sentences ?? []) {
      if (sentenceIds.has(s.sentenceId)) p.push(`tatoeba ${s.sentenceId}: in ${sentenceIds.get(s.sentenceId)} and ${pack.id}`);
      sentenceIds.set(s.sentenceId, pack.id);
    }
  }

  const core = packs.filter((pk) => pk.level);
  const gpTotal = core.reduce((n, pk) => n + pk.files["content.json"].grammarPoints.length, 0);
  if (gpTotal < COVERAGE.totalGrammarPoints) p.push(`coverage: ${gpTotal} grammar points, need ${COVERAGE.totalGrammarPoints}`);
  for (const [level, min] of Object.entries(COVERAGE.grammarPointsPerLevel)) {
    const pk = core.find((x) => x.level === level);
    const n = pk ? pk.files["content.json"].grammarPoints.length : 0;
    if (n < min) p.push(`coverage: ${level} has ${n} grammar points, need ${min}`);
  }
  for (const pk of core) {
    const content = pk.files["content.json"];
    for (const gp of content.grammarPoints) {
      const exs = content.exercises.filter((e) => e.grammarPointIds.includes(gp.id));
      if (exs.length < COVERAGE.exercisesPerGrammarPoint) p.push(`coverage: ${gp.id} has ${exs.length} exercises, need ${COVERAGE.exercisesPerGrammarPoint}`);
      const kinds = new Set(exs.map((e) => e.kind)).size;
      if (kinds < COVERAGE.kindsPerGrammarPoint) p.push(`coverage: ${gp.id} has ${kinds} exercise kinds, need ${COVERAGE.kindsPerGrammarPoint}`);
    }
  }
  const cards = core.reduce((n, pk) => n + pk.files["content.json"].exercises.filter((e) => e.kind === "flashcard").length, 0);
  if (cards < COVERAGE.totalFlashcards) p.push(`coverage: ${cards} flashcards, need ${COVERAGE.totalFlashcards}`);
  const sentences = core.reduce((n, pk) => n + (pk.files["sentences.json"]?.sentences.length ?? 0), 0);
  if (sentences < COVERAGE.totalSentences) p.push(`coverage: ${sentences} sentences, need ${COVERAGE.totalSentences}`);
  for (const [level, min] of Object.entries(COVERAGE.sentencesPerLevel)) {
    const pk = core.find((x) => x.level === level);
    const n = pk?.files["sentences.json"]?.sentences.length ?? 0;
    if (n < min) p.push(`coverage: ${level} has ${n} sentences, need ${min}`);
  }
  for (const level of LEVELS.slice(1)) if (!core.some((pk) => pk.level === level)) p.push(`coverage: no ${level} pack`);
  return p;
}

/**
 * Tatoeba attribution against the downloaded export: every id exists, with
 * the same text and author. `sentences` is the export as a Map.
 */
export function tatoebaProblems(packs, exportMap) {
  const p = [];
  const check = (where, sentenceId, text, author) => {
    const row = exportMap.get(sentenceId);
    if (!row) p.push(`${where}: Tatoeba sentence ${sentenceId} is not in the export`);
    else if (row.text !== text) p.push(`${where}: Tatoeba sentence ${sentenceId} text differs from the export`);
    else if (row.author !== author) p.push(`${where}: Tatoeba sentence ${sentenceId} author differs from the export`);
  };
  for (const pack of packs) {
    const content = pack.files["content.json"];
    for (const s of pack.files["sentences.json"]?.sentences ?? []) check(pack.id, s.sentenceId, s.text, s.author);
    for (const gp of content.grammarPoints) for (const ex of gp.examples) if (ex.source.kind === "tatoeba") check(gp.id, ex.source.sentenceId, ex.text, ex.source.author);
    for (const e of content.exercises) {
      const ex = e.example ?? (e.source ? { text: e.text, source: e.source } : null);
      if (ex?.source?.kind === "tatoeba") check(e.id, ex.source.sentenceId, ex.text, ex.source.author);
    }
  }
  return p;
}
