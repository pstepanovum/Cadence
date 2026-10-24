// FILE: src/components/mouth-map/copy.ts
//
// Labels and short how-to text for the mouth map, written for Cadence.
import type { ArticulationTarget, LayerId, Manner, OverlayId, Place } from "@/lib/platform/vocal-tract/index.ts";

export const LAYER_LABELS: Record<LayerId, string> = {
  lips: "Lips",
  teeth: "Teeth",
  alveolarRidge: "Ridge behind the top teeth",
  hardPalate: "Hard palate",
  velum: "Soft palate",
  tongueTip: "Tongue tip",
  tongueBlade: "Tongue blade",
  tongueBody: "Tongue body",
  tongueRoot: "Tongue root",
  jaw: "Jaw",
  glottis: "Vocal folds",
  pharynx: "Throat",
  nasalCavity: "Nasal cavity",
  face: "Face",
};

const PLACE: Record<Place, string> = {
  bilabial: "Both lips come together.",
  labiodental: "The top teeth rest lightly on the lower lip.",
  dental: "The tongue tip sits just between or behind the front teeth.",
  alveolar: "The tongue tip goes to the ridge just behind the top teeth.",
  postalveolar: "The front of the tongue sits a little behind the ridge, under the palate.",
  palatal: "The middle of the tongue rises toward the hard palate.",
  velar: "The back of the tongue rises to the soft palate.",
  "labial-velar": "Round the lips and raise the back of the tongue.",
  glottal: "The mouth stays relaxed; the sound comes from the throat.",
};

const MANNER: Record<Manner, string> = {
  plosive: "Close completely, let the air build, then release it in one small burst.",
  fricative: "Leave a narrow gap and push air through it steadily, so you hear a hiss.",
  affricate: "Start closed like a stop, then open straight into a hiss.",
  nasal: "Close the mouth here and let the air come out through the nose.",
  approximant: "Bring the parts close without touching; the air flows freely.",
  "lateral-approximant": "Touch the middle and let the air pass around the sides of the tongue.",
};

const OVERLAY_TIPS: Partial<Record<OverlayId, string>> = {
  tongueBetweenTeeth: "Let a little of the tongue tip show between the teeth.",
  lipRounding: "Round and push the lips forward a little.",
  lipSpreading: "Keep the lips relaxed or slightly spread.",
  bunchedTongue: "Pull the tongue back and bunch it up; the tip touches nothing.",
  lateralAirflow: "The sides of the tongue stay low.",
};

const HEIGHT: Record<string, string> = {
  close: "high",
  "near-close": "fairly high",
  "close-mid": "mid-high",
  mid: "in the middle",
  "open-mid": "mid-low",
  "near-open": "fairly low",
  open: "low",
};

export function voicingText(target: ArticulationTarget): string {
  return target.voicing === "voiced"
    ? "Voiced: your vocal folds buzz. Touch your throat to feel it."
    : "Voiceless: only breath, no buzz in the throat.";
}

/** Two to four short sentences on how to make the sound. */
export function howTo(target: ArticulationTarget): string[] {
  const lines: string[] = [];
  if (target.vowel) {
    const v = target.vowel;
    lines.push(
      `The tongue is ${HEIGHT[v.height] ?? v.height} and ${v.backness === "central" ? "central" : `toward the ${v.backness}`}; the lips are ${v.rounding === "rounded" ? "rounded" : "relaxed"}.`,
    );
    if (target.trajectory) lines.push("It moves: start at the first shape and glide to the second.");
  } else {
    if (target.place) lines.push(PLACE[target.place]);
    if (target.manner) lines.push(MANNER[target.manner]);
  }
  for (const overlay of target.overlays) {
    const tip = OVERLAY_TIPS[overlay];
    if (tip) lines.push(tip);
  }
  if (!target.vowel) lines.push(voicingText(target));
  return lines.slice(0, 4);
}

export function describeForScreenReader(name: string, target: ArticulationTarget): string {
  const parts = target.highlight.map((id) => LAYER_LABELS[id].toLowerCase()).join(", ");
  return `Side view of the mouth for ${name}. Highlighted: ${parts}. ${howTo(target).join(" ")}`;
}
