// FILE: mobile/src/platform/vocal-tract/articulation.ts
//
// The English sound inventory and the shape of an articulation target, the
// records content/articulation/*.json holds for the mouth map: model
// parameters (or a trajectory for diphthongs), phonetic features, the layers to
// highlight, the overlays the model cannot show itself, and where the numbers
// came from. Cadence's own data model; the parameters it stores drive the
// VocalTract port in maeda.ts (credited there, in NOTICE and in CREDITS.md).
//
// Twin: src/lib/platform/vocal-tract/articulation.ts, byte-identical below
// this header, checked by tests/platform/drift.test.ts.

import type { Keyframe } from "./animate.ts";
import type { LayerId, PlaceAnchor } from "./geometry.ts";
import { PARAM_KEYS, PARAM_MAX, PARAM_MIN, type VocalTractParams } from "./maeda.ts";

/**
 * General American and Received Pronunciation; a target that does not differ
 * between them is stored once as "both".
 */
export type AccentVariant = "GA" | "RP";
export type SoundKind = "consonant" | "vowel" | "diphthong";

export interface SoundInfo {
  /** `sound.<arpabet>`; permanent, progress is keyed by it. */
  id: string;
  /** IPA per variant; absent for a variant that lacks the sound. */
  ipa: Partial<Record<AccentVariant, string>>;
  /** ARPAbet symbol, lowercase, matching what phoneme scorers emit. */
  arpabet: string;
  kind: SoundKind;
  /** One common word with the sound, for labels. */
  example: string;
}

const both = (ipa: string) => ({ GA: ipa, RP: ipa });

/** Every English phoneme Cadence teaches, GA and RP. */
export const ENGLISH_SOUNDS: readonly SoundInfo[] = [
  { id: "sound.p", ipa: both("p"), arpabet: "p", kind: "consonant", example: "pen" },
  { id: "sound.b", ipa: both("b"), arpabet: "b", kind: "consonant", example: "bed" },
  { id: "sound.t", ipa: both("t"), arpabet: "t", kind: "consonant", example: "ten" },
  { id: "sound.d", ipa: both("d"), arpabet: "d", kind: "consonant", example: "day" },
  { id: "sound.k", ipa: both("k"), arpabet: "k", kind: "consonant", example: "cat" },
  { id: "sound.g", ipa: both("ɡ"), arpabet: "g", kind: "consonant", example: "go" },
  { id: "sound.f", ipa: both("f"), arpabet: "f", kind: "consonant", example: "fish" },
  { id: "sound.v", ipa: both("v"), arpabet: "v", kind: "consonant", example: "van" },
  { id: "sound.th", ipa: both("θ"), arpabet: "th", kind: "consonant", example: "think" },
  { id: "sound.dh", ipa: both("ð"), arpabet: "dh", kind: "consonant", example: "this" },
  { id: "sound.s", ipa: both("s"), arpabet: "s", kind: "consonant", example: "sun" },
  { id: "sound.z", ipa: both("z"), arpabet: "z", kind: "consonant", example: "zoo" },
  { id: "sound.sh", ipa: both("ʃ"), arpabet: "sh", kind: "consonant", example: "ship" },
  { id: "sound.zh", ipa: both("ʒ"), arpabet: "zh", kind: "consonant", example: "vision" },
  { id: "sound.hh", ipa: both("h"), arpabet: "hh", kind: "consonant", example: "hat" },
  { id: "sound.ch", ipa: both("tʃ"), arpabet: "ch", kind: "consonant", example: "chair" },
  { id: "sound.jh", ipa: both("dʒ"), arpabet: "jh", kind: "consonant", example: "jam" },
  { id: "sound.m", ipa: both("m"), arpabet: "m", kind: "consonant", example: "man" },
  { id: "sound.n", ipa: both("n"), arpabet: "n", kind: "consonant", example: "net" },
  { id: "sound.ng", ipa: both("ŋ"), arpabet: "ng", kind: "consonant", example: "sing" },
  { id: "sound.l", ipa: both("l"), arpabet: "l", kind: "consonant", example: "light" },
  { id: "sound.r", ipa: both("ɹ"), arpabet: "r", kind: "consonant", example: "right" },
  { id: "sound.w", ipa: both("w"), arpabet: "w", kind: "consonant", example: "wet" },
  { id: "sound.y", ipa: both("j"), arpabet: "y", kind: "consonant", example: "yes" },
  { id: "sound.iy", ipa: { GA: "i", RP: "iː" }, arpabet: "iy", kind: "vowel", example: "sheep" },
  { id: "sound.ih", ipa: both("ɪ"), arpabet: "ih", kind: "vowel", example: "ship" },
  { id: "sound.eh", ipa: { GA: "ɛ", RP: "e" }, arpabet: "eh", kind: "vowel", example: "bed" },
  { id: "sound.ae", ipa: both("æ"), arpabet: "ae", kind: "vowel", example: "cat" },
  { id: "sound.aa", ipa: { GA: "ɑ", RP: "ɑː" }, arpabet: "aa", kind: "vowel", example: "father" },
  { id: "sound.oh", ipa: { RP: "ɒ" }, arpabet: "oh", kind: "vowel", example: "lot" },
  { id: "sound.ao", ipa: { GA: "ɔ", RP: "ɔː" }, arpabet: "ao", kind: "vowel", example: "thought" },
  { id: "sound.uh", ipa: both("ʊ"), arpabet: "uh", kind: "vowel", example: "book" },
  { id: "sound.uw", ipa: { GA: "u", RP: "uː" }, arpabet: "uw", kind: "vowel", example: "food" },
  { id: "sound.ah", ipa: both("ʌ"), arpabet: "ah", kind: "vowel", example: "cup" },
  { id: "sound.ax", ipa: both("ə"), arpabet: "ax", kind: "vowel", example: "about" },
  { id: "sound.er", ipa: { GA: "ɝ", RP: "ɜː" }, arpabet: "er", kind: "vowel", example: "bird" },
  { id: "sound.axr", ipa: { GA: "ɚ" }, arpabet: "axr", kind: "vowel", example: "teacher" },
  { id: "sound.ey", ipa: both("eɪ"), arpabet: "ey", kind: "diphthong", example: "day" },
  { id: "sound.ay", ipa: both("aɪ"), arpabet: "ay", kind: "diphthong", example: "time" },
  { id: "sound.oy", ipa: both("ɔɪ"), arpabet: "oy", kind: "diphthong", example: "boy" },
  { id: "sound.ow", ipa: { GA: "oʊ", RP: "əʊ" }, arpabet: "ow", kind: "diphthong", example: "go" },
  { id: "sound.aw", ipa: both("aʊ"), arpabet: "aw", kind: "diphthong", example: "now" },
  { id: "sound.ia", ipa: { RP: "ɪə" }, arpabet: "ia", kind: "diphthong", example: "near" },
  { id: "sound.ea", ipa: { RP: "eə" }, arpabet: "ea", kind: "diphthong", example: "square" },
  { id: "sound.ua", ipa: { RP: "ʊə" }, arpabet: "ua", kind: "diphthong", example: "tour" },
];

export type Place =
  | "bilabial"
  | "labiodental"
  | "dental"
  | "alveolar"
  | "postalveolar"
  | "palatal"
  | "velar"
  | "labial-velar"
  | "glottal";

export type Manner = "plosive" | "fricative" | "affricate" | "nasal" | "approximant" | "lateral-approximant";

/** Things the midsagittal model cannot show, drawn as layers on top. */
export type OverlayId =
  | "tongueTipContact"
  | "tongueBetweenTeeth"
  | "lateralAirflow"
  | "nasalAirflow"
  | "centralAirflow"
  | "lipRounding"
  | "lipSpreading"
  | "bunchedTongue"
  | "plosiveBurst"
  | "glottalFriction";

export interface VowelFeatures {
  height: "close" | "near-close" | "close-mid" | "mid" | "open-mid" | "near-open" | "open";
  backness: "front" | "central" | "back";
  rounding: "rounded" | "unrounded";
}

/** One record in content/articulation/*.json. */
export interface ArticulationTarget {
  soundId: string;
  variant: AccentVariant | "both";
  /** The steady articulation; consonants and monophthongs. */
  params?: VocalTractParams;
  /** Start-to-end motion; diphthongs and affricates. */
  trajectory?: Keyframe[];
  place?: Place;
  manner?: Manner;
  voicing: "voiced" | "voiceless";
  airflow: "central" | "lateral" | "nasal";
  vowel?: VowelFeatures;
  /** Layers to highlight, most important first. */
  highlight: LayerId[];
  overlays: OverlayId[];
  /** Where an overlay or the airflow arrow points. */
  anchor?: PlaceAnchor;
  source: {
    method: "fitted" | "literature" | "hand-tuned";
    /** URLs of the CC0 reference drawings or citations of published values. */
    references: string[];
    /** Root-mean-square fit error in drawing units, for fitted targets. */
    fitRms?: number;
  };
  /** True for anything not fitted or taken from the literature; listed for review. */
  needsReview: boolean;
}

export function soundById(id: string): SoundInfo | undefined {
  return ENGLISH_SOUNDS.find((sound) => sound.id === id);
}

function paramProblems(where: string, params: VocalTractParams): string[] {
  return PARAM_KEYS.filter((key) => {
    const value = params[key];
    return typeof value !== "number" || !Number.isFinite(value) || value < PARAM_MIN || value > PARAM_MAX;
  }).map((key) => `${where}: ${key} must be a number from ${PARAM_MIN} to ${PARAM_MAX}`);
}

/** Problems with one target; empty when it is valid. */
export function validateArticulationTarget(target: ArticulationTarget): string[] {
  const at = `${target.soundId} (${target.variant})`;
  const p: string[] = [];
  const sound = soundById(target.soundId);
  if (!sound) p.push(`${at}: unknown sound`);
  if (target.variant !== "both" && sound && !sound.ipa[target.variant]) p.push(`${at}: the sound does not exist in ${target.variant}`);
  if (!target.params && !target.trajectory) p.push(`${at}: needs params or a trajectory`);
  if (target.params) p.push(...paramProblems(at, target.params));
  if (target.trajectory) {
    if (target.trajectory.length < 2) p.push(`${at}: a trajectory needs at least two keyframes`);
    target.trajectory.forEach((frame, i) => {
      p.push(...paramProblems(`${at} keyframe ${i}`, frame.params));
      if (i > 0 && frame.at <= target.trajectory![i - 1].at) p.push(`${at}: keyframes must move forward in time`);
    });
    if (sound?.kind === "diphthong" && target.params) p.push(`${at}: a diphthong is a trajectory, not a steady shape`);
  }
  if (sound?.kind !== "consonant" && !target.vowel) p.push(`${at}: vowels need height, backness and rounding`);
  if (sound?.kind === "consonant" && (!target.place || !target.manner)) p.push(`${at}: consonants need place and manner`);
  if (target.highlight.length === 0) p.push(`${at}: highlight at least one layer`);
  if (target.source.method === "hand-tuned" && !target.needsReview) p.push(`${at}: hand-tuned targets must be marked needsReview`);
  if (target.source.method !== "hand-tuned" && target.source.references.length === 0) p.push(`${at}: cite the reference it was fitted to or taken from`);
  return p;
}
