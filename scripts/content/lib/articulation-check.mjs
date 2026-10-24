// Checks on content/articulation/*.json, shared by validate-articulation.mjs
// and the tests: every English sound has a valid target for every accent
// variant that has it, every phoneme the content uses has a target, and each
// fitted target still reproduces the traced reference points it was fitted to.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "./paths.mjs";
import { ENGLISH_SOUNDS, computeVocalTract, validateArticulationTarget } from "../../../src/lib/platform/vocal-tract/index.ts";

/** Largest RMS distance (drawing units) a fitted target may sit from its traced reference. */
export const FIT_TOLERANCE = 0.065;

/** Allophones and spellings the content uses, mapped to the phoneme that teaches them. */
export const IPA_ALIASES = { "ɾ": "t", "ʔ": "t", "ɫ": "l", "r": "ɹ", "g": "ɡ", "e": "ɛ", "ɝː": "ɝ", "ɜ": "ɜː", "o": "oʊ" };

export function loadTargets() {
  const dir = join(CONTENT_DIR, "articulation");
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  return {
    targets: ["consonants.json", "vowels.json", "diphthongs.json"].flatMap((n) => read(n).targets),
    references: read("references.json").references,
  };
}

/** IPA symbol (either accent, with or without length marks) to sound id. */
export function soundIdForIpa(ipa) {
  const clean = String(ipa).replace(/[/[\]]/g, "").trim();
  const candidates = [clean, IPA_ALIASES[clean], clean.replace(/ː/g, "")].filter(Boolean);
  for (const c of candidates) {
    const hit = ENGLISH_SOUNDS.find((s) => Object.values(s.ipa).some((v) => v === c || v.replace(/ː/g, "") === c));
    if (hit) return hit.id;
  }
  return null;
}

/** Splits an IPA string such as "str" or "tʃ" into phonemes the inventory knows. */
export function splitIpa(ipa) {
  const clean = String(ipa).replace(/[/[\]]/g, "").trim();
  const out = [];
  let i = 0;
  while (i < clean.length) {
    let matched = null;
    for (const len of [3, 2, 1]) {
      const piece = clean.slice(i, i + len);
      if (piece.length === len && soundIdForIpa(piece)) {
        matched = piece;
        break;
      }
    }
    if (!matched) return null;
    out.push(soundIdForIpa(matched));
    i += matched.length;
  }
  return out;
}

export function coverageProblems(targets) {
  const p = [];
  for (const sound of ENGLISH_SOUNDS) {
    for (const variant of Object.keys(sound.ipa)) {
      if (!targets.some((t) => t.soundId === sound.id && (t.variant === variant || t.variant === "both"))) {
        p.push(`${sound.id}: no target for ${variant}`);
      }
    }
  }
  const seen = new Set();
  for (const t of targets) {
    const key = `${t.soundId}:${t.variant}`;
    if (seen.has(key)) p.push(`${key}: duplicate target`);
    seen.add(key);
    if (t.variant === "both" && targets.some((o) => o.soundId === t.soundId && o.variant !== "both")) p.push(`${key}: both and a variant`);
  }
  return p;
}

export function fitProblems(targets, references) {
  const p = [];
  const byUrl = new Map(references.map((r) => [r.url, r]));
  for (const t of targets) {
    p.push(...validateArticulationTarget(t));
    if (t.source.method !== "fitted" || !t.params) continue;
    const ref = byUrl.get(t.source.references[0]);
    if (!ref) {
      p.push(`${t.soundId} (${t.variant}): fitted to ${t.source.references[0]}, which references.json lacks`);
      continue;
    }
    const { points } = computeVocalTract(t.params);
    const names = Object.keys(ref.targets);
    const rms = Math.sqrt(names.reduce((s, n) => s + (points[n].x - ref.targets[n].x) ** 2 + (points[n].y - ref.targets[n].y) ** 2, 0) / names.length);
    if (rms > FIT_TOLERANCE) p.push(`${t.soundId} (${t.variant}): ${rms.toFixed(3)} from its reference, over ${FIT_TOLERANCE}`);
    if (t.source.fitRms !== undefined && rms > t.source.fitRms + 1e-6) p.push(`${t.soundId} (${t.variant}): fit drifted (${rms.toFixed(4)} > ${t.source.fitRms})`);
  }
  return p;
}
