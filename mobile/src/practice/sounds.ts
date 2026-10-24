// Words for the mouth map: layer names, a one-line description of a sound,
// what changes between two sounds, and which sound a scorer's phoneme symbol
// stands for. Pure, so it is unit tested (tests/sounds.test.ts).
import {
  ENGLISH_SOUNDS,
  type ArticulationTarget,
  type OverlayId,
  type SoundInfo,
} from "../platform/vocal-tract/articulation.ts";
import type { LayerId } from "../platform/vocal-tract/geometry.ts";

export const LAYER_LABELS: Record<LayerId, string> = {
  lips: "Lips",
  teeth: "Teeth",
  alveolarRidge: "Gum ridge",
  hardPalate: "Hard palate",
  velum: "Soft palate",
  tongueTip: "Tongue tip",
  tongueBlade: "Tongue blade",
  tongueBody: "Tongue body",
  tongueRoot: "Tongue root",
  jaw: "Jaw",
  glottis: "Voice box",
  pharynx: "Throat",
  nasalCavity: "Nose",
  face: "Face",
};

export const OVERLAY_HINTS: Record<OverlayId, string> = {
  tongueTipContact: "The tongue tip touches the gum ridge.",
  tongueBetweenTeeth: "The tongue tip rests lightly between the teeth.",
  lateralAirflow: "Air flows around the sides of the tongue.",
  nasalAirflow: "Air goes out through the nose.",
  centralAirflow: "Air flows through a narrow gap in the middle.",
  lipRounding: "Round the lips.",
  lipSpreading: "Spread the lips a little, like a small smile.",
  bunchedTongue: "Pull the tongue back and up without touching the roof.",
  plosiveBurst: "Close completely, then release with a small puff.",
  glottalFriction: "Breathe out through an open throat.",
};

const MANNER_WORDS: Record<NonNullable<ArticulationTarget["manner"]>, string> = {
  plosive: "stop",
  fricative: "hissing sound",
  affricate: "stop that opens into a hiss",
  nasal: "nasal",
  approximant: "glide",
  "lateral-approximant": "side sound",
};

const PLACE_WORDS: Record<NonNullable<ArticulationTarget["place"]>, string> = {
  bilabial: "both lips",
  labiodental: "lower lip and upper teeth",
  dental: "tongue and teeth",
  alveolar: "tongue tip and gum ridge",
  postalveolar: "tongue just behind the gum ridge",
  palatal: "tongue and hard palate",
  velar: "back of the tongue and soft palate",
  "labial-velar": "rounded lips and the back of the tongue",
  glottal: "the throat",
};

/** One plain sentence: "A voiced stop made with both lips." */
export function describeTarget(target: ArticulationTarget, sound: SoundInfo): string {
  const voicing = target.voicing === "voiced" ? "voiced" : "voiceless";
  if (sound.kind === "consonant") {
    const manner = target.manner ? MANNER_WORDS[target.manner] : "consonant";
    const place = target.place ? ` made with the ${PLACE_WORDS[target.place]}` : "";
    return `A ${voicing} ${manner}${place}.`;
  }
  const v = target.vowel;
  const shape = v ? `${v.height.replace("-", " ")} ${v.backness}` : "";
  const kind = sound.kind === "diphthong" ? "glide between two vowels, starting" : "vowel,";
  const rounding = v?.rounding === "rounded" ? "with rounded lips" : "with relaxed lips";
  return sound.kind === "diphthong"
    ? `A ${kind} ${shape}, ${rounding}.`.replace(/\s+/g, " ")
    : `A ${shape} ${kind} ${rounding}.`.replace(/\s+,/g, ",").replace(/\s+/g, " ");
}

/** What a learner should notice between two sounds, most telling first. */
export function compareTargets(a: ArticulationTarget, b: ArticulationTarget, labels: [string, string]): string[] {
  const lines: string[] = [];
  const [la, lb] = labels;
  if (a.place && b.place && a.place !== b.place) {
    lines.push(`${la} uses the ${PLACE_WORDS[a.place]}; ${lb} uses the ${PLACE_WORDS[b.place]}.`);
  }
  if (a.manner && b.manner && a.manner !== b.manner) {
    lines.push(`${la} is a ${MANNER_WORDS[a.manner]}; ${lb} is a ${MANNER_WORDS[b.manner]}.`);
  }
  if (a.voicing !== b.voicing) {
    const voiced = a.voicing === "voiced" ? la : lb;
    lines.push(`${voiced} is voiced: feel the buzz in your throat.`);
  }
  if (a.airflow !== b.airflow) {
    lines.push(`Air: ${a.airflow} for ${la}, ${b.airflow} for ${lb}.`);
  }
  if (a.vowel && b.vowel) {
    if (a.vowel.height !== b.vowel.height) {
      lines.push(`The tongue is ${a.vowel.height.replace("-", " ")} for ${la} and ${b.vowel.height.replace("-", " ")} for ${lb}.`);
    }
    if (a.vowel.backness !== b.vowel.backness) {
      lines.push(`The tongue sits ${a.vowel.backness} for ${la} and ${b.vowel.backness} for ${lb}.`);
    }
    if (a.vowel.rounding !== b.vowel.rounding) {
      const rounded = a.vowel.rounding === "rounded" ? la : lb;
      lines.push(`Round your lips for ${rounded}.`);
    }
  }
  const tense = (t: ArticulationTarget) => (t.params ? t.params.jaw + t.params.tongueShape : 0);
  if (lines.length === 0 && a.params && b.params && Math.abs(tense(a) - tense(b)) > 0.4) {
    const higher = tense(a) > tense(b) ? la : lb;
    lines.push(`${higher} is tenser: the tongue rises higher and the lips spread more.`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Scorer symbols to sounds
// ---------------------------------------------------------------------------

/**
 * espeak IPA symbols the phoneme scorer can emit that are not spelled exactly
 * as in ENGLISH_SOUNDS, mapped to the sound they belong to.
 */
const ALIASES: Record<string, string> = {
  g: "sound.g",
  r: "sound.r",
  ɾ: "sound.t",
  ʔ: "sound.t",
  ɫ: "sound.l",
  ɐ: "sound.ah",
  ᵻ: "sound.ih",
  i: "sound.iy",
  u: "sound.uw",
  ɜ: "sound.er",
  ɚ: "sound.axr",
  e: "sound.eh",
  o: "sound.ow",
  oʊ: "sound.ow",
  əʊ: "sound.ow",
  ɑ: "sound.aa",
  ɒ: "sound.oh",
  ɔ: "sound.ao",
  ɪə: "sound.ia",
  eə: "sound.ea",
  ʊə: "sound.ua",
  a: "sound.aa",
  aɪ: "sound.ay",
  aʊ: "sound.aw",
};

const BY_IPA: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const sound of ENGLISH_SOUNDS) {
    for (const ipa of Object.values(sound.ipa)) {
      if (ipa) map.set(ipa.replace(/ː/g, ""), sound.id);
    }
  }
  return map;
})();

/** The sound a scorer symbol like "/θ/" or "iː" stands for, or null. */
export function soundIdForSymbol(symbol: string): string | null {
  const clean = symbol.replace(/[/[\]ˈˌː.]/g, "").trim();
  if (!clean) return null;
  return BY_IPA.get(clean) ?? ALIASES[clean] ?? null;
}

/**
 * How common each sound is in running English, as a coarse weight from 1
 * (rare) to 3 (very common). Provisional, from general phonetics: the content
 * pipeline will replace it with a count over the Tatoeba sentences
 * (docs/PLATFORM.md, section 13.3), shipped in the sounds pack.
 */
const COMMON = ["sound.ax", "sound.n", "sound.t", "sound.ih", "sound.s", "sound.r", "sound.d", "sound.l", "sound.dh", "sound.iy", "sound.k", "sound.m"];
const RARE = ["sound.zh", "sound.oy", "sound.ua", "sound.th", "sound.ch", "sound.jh", "sound.ng", "sound.y", "sound.uh", "sound.aw"];

export function frequencyWeight(soundId: string, counts?: Readonly<Record<string, number>>): number {
  if (counts && counts[soundId] !== undefined) return counts[soundId];
  if (COMMON.includes(soundId)) return 3;
  if (RARE.includes(soundId)) return 1;
  return 2;
}
