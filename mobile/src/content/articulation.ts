// The mouth-map targets the app ships with, from content/articulation/*.json
// (copied by scripts/sync-content.mjs). Small enough to live in the JS bundle,
// so the sounds library opens instantly and works offline.
import generated from "./articulation.generated.json";

import {
  ENGLISH_SOUNDS,
  soundById,
  type AccentVariant,
  type ArticulationTarget,
  type SoundInfo,
} from "../platform/vocal-tract/articulation.ts";

const TARGETS = (generated as unknown as { targets: ArticulationTarget[] }).targets;

/** "fixture" while the content pipeline has not delivered fitted targets. */
export const ARTICULATION_SOURCE = (generated as { source?: string }).source ?? "content";

/** The target for one sound in one accent, falling back to the shared "both" record. */
export function targetFor(soundId: string, accent: AccentVariant): ArticulationTarget | null {
  return (
    TARGETS.find((t) => t.soundId === soundId && t.variant === accent) ??
    TARGETS.find((t) => t.soundId === soundId && t.variant === "both") ??
    null
  );
}

/** Sounds that exist in an accent, in inventory order. */
export function soundsFor(accent: AccentVariant): SoundInfo[] {
  return ENGLISH_SOUNDS.filter((sound) => Boolean(sound.ipa[accent]));
}

export function ipaFor(sound: SoundInfo, accent: AccentVariant): string {
  return sound.ipa[accent] ?? sound.ipa.GA ?? sound.ipa.RP ?? "";
}

export { soundById };
