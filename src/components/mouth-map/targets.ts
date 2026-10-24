// FILE: src/components/mouth-map/targets.ts
//
// Pure helpers over articulation targets, shared by the server loader and the
// client components.
import type { AccentVariant, ArticulationTarget, SoundInfo } from "@/lib/platform/vocal-tract/index.ts";
import { ENGLISH_SOUNDS } from "@/lib/platform/vocal-tract/index.ts";

export type Variant = AccentVariant;

/** The target for a sound in an accent: the exact variant, else the shared one. */
export function targetFor(
  targets: readonly ArticulationTarget[],
  soundId: string,
  variant: Variant,
): ArticulationTarget | undefined {
  return (
    targets.find((t) => t.soundId === soundId && t.variant === variant) ??
    targets.find((t) => t.soundId === soundId && t.variant === "both")
  );
}

/** Sounds that exist in an accent (RP has no ɚ; GA has no ɒ or centring diphthongs). */
export function soundsIn(variant: Variant): SoundInfo[] {
  return ENGLISH_SOUNDS.filter((sound) => Boolean(sound.ipa[variant]));
}

export function ipaOf(sound: SoundInfo, variant: Variant): string {
  return sound.ipa[variant] ?? sound.ipa.GA ?? sound.ipa.RP ?? "";
}

/** Spellings scorers use for a sound that differ from ENGLISH_SOUNDS' IPA. */
const IPA_ALIASES: Record<string, string> = {
  r: "sound.r",
  g: "sound.g",
  ɫ: "sound.l",
  ɾ: "sound.t",
  ᵻ: "sound.ih",
  ɐ: "sound.ax",
  ɜ: "sound.er",
  ɝ: "sound.er",
  ɚ: "sound.axr",
  a: "sound.aa",
  e: "sound.eh",
  o: "sound.ao",
  ɑɹ: "sound.aa",
  ʧ: "sound.ch",
  ʤ: "sound.jh",
};

const BY_IPA: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const sound of ENGLISH_SOUNDS) {
    for (const ipa of Object.values(sound.ipa)) {
      if (!ipa) continue;
      if (!map.has(ipa)) map.set(ipa, sound.id);
      const short = ipa.replace(/ː/g, "");
      if (!map.has(short)) map.set(short, sound.id);
    }
  }
  return map;
})();

/**
 * `sound.th` from a scorer's symbol: IPA as the phoneme scorer emits it
 * (`/θ/`, `ˈiː`), or ARPAbet (`TH`, `th1`). Null for anything Cadence does not
 * teach as a separate sound (a glottal stop, a pause).
 */
export function soundIdFromSymbol(symbol: string): string | null {
  const ipa = symbol.trim().replace(/^\/|\/$/g, "").replace(/[ˈˌ.]/g, "").trim();
  if (!ipa || ipa === "-") return null;
  const direct = BY_IPA.get(ipa) ?? BY_IPA.get(ipa.replace(/ː/g, "")) ?? IPA_ALIASES[ipa.replace(/ː/g, "")];
  if (direct) return direct;
  const arpabet = ipa.toLowerCase().replace(/[0-9]/g, "");
  return ENGLISH_SOUNDS.find((entry) => entry.arpabet === arpabet)?.id ?? null;
}

/** @deprecated name kept for callers that pass ARPAbet; same as soundIdFromSymbol. */
export const soundIdFromArpabet = soundIdFromSymbol;

/** Minimal pairs the compare view offers, each pair of sounds with a word for each. */
export const MINIMAL_PAIRS: readonly { a: string; b: string; words: [string, string] }[] = [
  { a: "sound.ih", b: "sound.iy", words: ["ship", "sheep"] },
  { a: "sound.l", b: "sound.r", words: ["light", "right"] },
  { a: "sound.th", b: "sound.s", words: ["think", "sink"] },
  { a: "sound.v", b: "sound.w", words: ["vet", "wet"] },
  { a: "sound.ae", b: "sound.eh", words: ["bad", "bed"] },
  { a: "sound.uh", b: "sound.uw", words: ["full", "fool"] },
  { a: "sound.ah", b: "sound.ae", words: ["cup", "cap"] },
  { a: "sound.sh", b: "sound.s", words: ["she", "see"] },
];
