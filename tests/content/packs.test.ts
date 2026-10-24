// The built content packs in public/packs, as the apps load them: the index
// and manifests agree with the files, every pack passes the shared validator,
// every answer key grades as correct, Tatoeba sentences keep their
// attribution, the size budget holds, and the CEFR coverage targets are met.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  canReadPack,
  gradeExercise,
  validatePackContent,
  type Exercise,
  type ExerciseAnswer,
  type PackContent,
  type PackIndex,
  type PackManifest,
} from "../../src/lib/platform/content-model.ts";

const packsDir = join(import.meta.dirname, "../../public/packs");
const index: PackIndex = JSON.parse(readFileSync(join(packsDir, "index.json"), "utf8"));
const packs = index.packs.map((entry) => {
  const manifest: PackManifest = JSON.parse(readFileSync(join(packsDir, entry.manifest), "utf8"));
  const dir = join(packsDir, entry.id, `v${entry.version}`);
  const raw = (name: string) => readFileSync(join(dir, name));
  const json = (name: string) => JSON.parse(raw(name).toString("utf8"));
  return { entry, manifest, dir, raw, json, content: json("content.json") as PackContent };
});
const core = packs.filter((p) => p.manifest.level);

function keyAnswer(e: Exercise): ExerciseAnswer {
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
      return { kind: e.kind, played: 1, choice: 1 };
    case "flashcard":
      return { kind: e.kind, grade: "good" };
  }
}

test("index, manifests and files agree", () => {
  assert.ok(packs.some((p) => p.entry.id === "sounds"));
  for (const level of ["a2", "b1", "b2", "c1", "c2"]) assert.ok(packs.some((p) => p.entry.id === `core-${level}`), `core-${level}`);
  for (const p of packs) {
    assert.ok(canReadPack(p.manifest));
    assert.equal(p.manifest.id, p.entry.id);
    assert.equal(p.manifest.version, p.entry.version);
    for (const file of p.manifest.files) {
      const data = p.raw(file.path);
      assert.equal(data.length, file.bytes, `${p.entry.id}/${file.path} size`);
      assert.equal(createHash("sha256").update(data).digest("hex"), file.sha256, `${p.entry.id}/${file.path} hash`);
    }
  }
});

test("every pack passes the content-model validator", () => {
  for (const p of packs) assert.deepEqual(validatePackContent(p.content), [], p.entry.id);
});

test("every answer key grades as correct", () => {
  for (const p of packs) {
    for (const e of p.content.exercises) assert.ok(gradeExercise(e, keyAnswer(e)).correct, e.id);
  }
});

test("ids are unique across packs", () => {
  const seen = new Map<string, string>();
  for (const p of packs) {
    for (const item of [...p.content.grammarPoints, ...p.content.lessons, ...p.content.exercises]) {
      assert.ok(!seen.has(item.id), `${item.id} in ${seen.get(item.id)} and ${p.entry.id}`);
      seen.set(item.id, p.entry.id);
    }
  }
});

test("Tatoeba sentences keep their id and author", () => {
  for (const p of core) {
    const { sentences, license } = p.json("sentences.json");
    assert.match(license, /CC BY 2\.0 FR/);
    for (const s of sentences) {
      assert.ok(Number.isInteger(s.sentenceId) && s.author && s.text, `${p.entry.id} sentence ${s.sentenceId}`);
    }
    for (const gp of p.content.grammarPoints) {
      for (const ex of gp.examples) {
        if (ex.source.kind === "tatoeba") assert.ok(Number.isInteger(ex.source.sentenceId) && ex.source.author, gp.id);
      }
    }
  }
});

test("content.json stays within the size budget", () => {
  for (const p of packs) {
    const raw = p.raw("content.json");
    assert.ok(raw.length <= 1.5 * 1024 * 1024, `${p.entry.id}: ${raw.length} bytes raw`);
    assert.ok(gzipSync(raw).length <= 300 * 1024, `${p.entry.id}: ${gzipSync(raw).length} bytes gzip`);
  }
});

test("CEFR coverage: grammar, exercises, flashcards and sentences", () => {
  const gps = core.flatMap((p) => p.content.grammarPoints);
  assert.ok(gps.length >= 120, `${gps.length} grammar points`);
  for (const p of core.filter((x) => x.manifest.level !== "A1")) {
    assert.ok(p.content.grammarPoints.length >= 12, `${p.entry.id}: ${p.content.grammarPoints.length} grammar points`);
    for (const gp of p.content.grammarPoints) {
      const exercises = p.content.exercises.filter((e) => e.grammarPointIds.includes(gp.id));
      assert.ok(exercises.length >= 12, `${gp.id}: ${exercises.length} exercises`);
      assert.ok(new Set(exercises.map((e) => e.kind)).size >= 4, `${gp.id}: too few kinds`);
      assert.ok(gp.examples.length >= 2 && gp.explanation.length > 0, gp.id);
    }
  }
  const cards = core.flatMap((p) => p.content.exercises.filter((e) => e.kind === "flashcard"));
  assert.ok(cards.length >= 3000, `${cards.length} flashcards`);
  assert.ok(cards.every((c) => c.kind === "flashcard" && c.example?.text), "every flashcard has an example");
  const sentences = core.reduce((n, p) => n + p.json("sentences.json").sentences.length, 0);
  assert.ok(sentences >= 5000, `${sentences} sentences`);
});
