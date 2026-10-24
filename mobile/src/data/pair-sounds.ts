// Which two sounds each minimal-pair group contrasts, in the order of its
// words (the first word has the first sound). Used by the drill ladder's pair
// step and the mouth map's compare view.
import { MINIMAL_PAIRS } from "./minimal-pairs.ts";

export const PAIR_GROUP_SOUNDS: Record<string, readonly [string, string]> = {
  "r-l": ["sound.r", "sound.l"],
  "v-w": ["sound.v", "sound.w"],
  "th-voiceless": ["sound.th", "sound.s"],
  "th-voiced": ["sound.dh", "sound.d"],
  "i-ee": ["sound.ih", "sound.iy"],
  "a-e": ["sound.ae", "sound.eh"],
  "a-u": ["sound.ae", "sound.ah"],
  oo: ["sound.uh", "sound.uw"],
  "sh-ch": ["sound.sh", "sound.ch"],
  "o-oh": ["sound.oh", "sound.ow"],
  "ay-e": ["sound.ey", "sound.eh"],
};

/** Every pair with its sounds, for the drill ladder. Voicing pairs vary per word, so they are left out. */
export const PAIRS_WITH_SOUNDS = MINIMAL_PAIRS.flatMap((group) => {
  const sounds = PAIR_GROUP_SOUNDS[group.key];
  return sounds ? group.pairs.map((words) => ({ words, soundIds: sounds })) : [];
});

/** The compare view's featured pairs. */
export const FEATURED_COMPARISONS: { words: [string, string]; soundIds: [string, string] }[] = [
  { words: ["ship", "sheep"], soundIds: ["sound.ih", "sound.iy"] },
  { words: ["light", "right"], soundIds: ["sound.l", "sound.r"] },
  { words: ["think", "sink"], soundIds: ["sound.th", "sound.s"] },
  { words: ["vine", "wine"], soundIds: ["sound.v", "sound.w"] },
  { words: ["full", "fool"], soundIds: ["sound.uh", "sound.uw"] },
  { words: ["then", "den"], soundIds: ["sound.dh", "sound.d"] },
];
