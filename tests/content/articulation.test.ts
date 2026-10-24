// The mouth map's English targets (content/articulation/*.json): every sound
// in the inventory has a valid target for each accent that has it, every
// phoneme the content uses has one, and the fitted targets still match the
// traced CC0 reference drawings they were fitted to.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ENGLISH_SOUNDS,
  computeVocalTract,
  validateArticulationTarget,
  type ArticulationTarget,
  type MovablePoints,
  type Point,
} from "../../src/lib/platform/vocal-tract/index.ts";

const root = join(import.meta.dirname, "../..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const targets: ArticulationTarget[] = ["consonants", "vowels", "diphthongs"].flatMap(
  (name) => read(`content/articulation/${name}.json`).targets,
);
const references: { url: string; targets: Partial<Record<keyof MovablePoints, Point>> }[] =
  read("content/articulation/references.json").references;

/** Kept in step with scripts/content/lib/articulation-check.mjs. */
const FIT_TOLERANCE = 0.065;
const ALIASES: Record<string, string> = { "ɾ": "t", "ʔ": "t", "ɫ": "l", r: "ɹ", g: "ɡ", e: "ɛ", "ɜ": "ɜː", o: "oʊ" };

function soundIdForIpa(symbol: string): string | null {
  for (const c of [symbol, ALIASES[symbol], symbol.replace(/ː/g, "")].filter(Boolean)) {
    const hit = ENGLISH_SOUNDS.find((s) => Object.values(s.ipa).some((v) => v === c || v!.replace(/ː/g, "") === c));
    if (hit) return hit.id;
  }
  return null;
}

/** "str" -> [s, t, r]; longest known symbol first. */
function splitIpa(ipa: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < ipa.length) {
    const len = [3, 2, 1].find((n) => i + n <= ipa.length && soundIdForIpa(ipa.slice(i, i + n)));
    if (!len) return null;
    out.push(soundIdForIpa(ipa.slice(i, i + len))!);
    i += len;
  }
  return out;
}

const hasTarget = (soundId: string, variant?: string) =>
  targets.some((t) => t.soundId === soundId && (variant === undefined || t.variant === variant || t.variant === "both"));

test("every English sound has a valid target for each accent variant", () => {
  for (const sound of ENGLISH_SOUNDS) {
    for (const variant of Object.keys(sound.ipa)) {
      assert.ok(hasTarget(sound.id, variant), `${sound.id} has no ${variant} target`);
    }
  }
  for (const target of targets) assert.deepEqual(validateArticulationTarget(target), [], `${target.soundId} ${target.variant}`);
});

test("no sound has two targets for the same accent", () => {
  const keys = targets.map((t) => `${t.soundId}:${t.variant}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const t of targets.filter((x) => x.variant === "both")) {
    assert.ok(!targets.some((o) => o.soundId === t.soundId && o.variant !== "both"), `${t.soundId} is both and per-variant`);
  }
});

test("every phoneme the content teaches has a target", () => {
  // Pronunciation modules: the IPA in phoneme_focus.
  const sql = readFileSync(join(root, "content/modules.sql"), "utf8");
  const symbols = [...sql.matchAll(/ARRAY\[([^\]]*)\]/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));
  assert.ok(symbols.length > 10);
  for (const symbol of symbols) {
    for (const part of symbol.split("-")) {
      const ids = splitIpa(part.replace(/\//g, ""));
      assert.ok(ids, `phoneme ${part} from modules.sql is not in the inventory`);
      for (const id of ids!) assert.ok(hasTarget(id), `${id} (from ${part}) has no articulation target`);
    }
  }
  // Minimal pairs and any sound ids in the sources.
  const pairs = read("content/sounds/minimal-pairs.json").exercises as { soundIds: string[] }[];
  for (const id of pairs.flatMap((p) => p.soundIds)) assert.ok(hasTarget(id), `${id} (minimal pairs) has no target`);
});

test("hand-tuned targets are marked for review and fitted ones cite a drawing", () => {
  for (const t of targets) {
    if (t.source.method === "hand-tuned") assert.equal(t.needsReview, true, `${t.soundId} ${t.variant}`);
    if (t.source.method === "fitted") assert.match(t.source.references[0], /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  }
});

test("fitted contours stay within tolerance of their traced references", () => {
  const byUrl = new Map(references.map((r) => [r.url, r]));
  let checked = 0;
  for (const t of targets) {
    if (t.source.method !== "fitted" || !t.params) continue;
    const ref = byUrl.get(t.source.references[0]);
    assert.ok(ref, `${t.soundId}: reference missing from references.json`);
    const { points } = computeVocalTract(t.params);
    const names = Object.keys(ref!.targets) as (keyof MovablePoints)[];
    const rms = Math.sqrt(
      names.reduce((s, n) => s + (points[n].x - ref!.targets[n]!.x) ** 2 + (points[n].y - ref!.targets[n]!.y) ** 2, 0) / names.length,
    );
    assert.ok(rms <= FIT_TOLERANCE, `${t.soundId} ${t.variant}: ${rms.toFixed(3)} over ${FIT_TOLERANCE}`);
    if (t.source.fitRms !== undefined) assert.ok(rms <= t.source.fitRms + 1e-6, `${t.soundId}: fit drifted`);
    checked += 1;
  }
  assert.ok(checked >= 25, `only ${checked} fitted targets checked`);
});
