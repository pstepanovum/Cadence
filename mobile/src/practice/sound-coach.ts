// Sound-by-sound coaching (docs/PLATFORM.md, section 13.3): per-sound mastery
// from the phoneme scores, the personal "sounds to fix" list, the drill
// ladder (sound, syllable, word, minimal pair, phrase, sentence), and spaced
// review of fixed sounds. Pure and unit tested (tests/sound-coach.test.ts);
// the store keeps it on the phone, and Plus syncs it as mastery/sounds.
import { frequencyWeight, soundIdForSymbol } from "./sounds.ts";

export const DRILL_STEPS = ["sound", "syllable", "word", "pair", "phrase", "sentence"] as const;
export type DrillStep = (typeof DRILL_STEPS)[number];

export const DRILL_STEP_LABELS: Record<DrillStep, string> = {
  sound: "The sound alone",
  syllable: "Syllables",
  word: "Words",
  pair: "Minimal pairs",
  phrase: "Phrases",
  sentence: "Sentences",
};

/** A step is passed at three takes in a row at this score or above. */
export const PASS_SCORE = 80;
export const TAKES_TO_PASS = 3;
/** Days after fixing a sound when it comes back for a quick check. */
export const REVIEW_DAYS = [1, 3, 7, 21] as const;
const EMA_ALPHA = 0.3;
const HISTORY_DAYS = 30;

export interface SoundMastery {
  attempts: number;
  /** Smoothed score, 0 to 100. */
  ema: number;
  best: number;
  lastAt: number;
  /** One averaged score per day, the last 30 days. */
  history: { day: string; score: number; takes: number }[];
  /** Position on the ladder and takes in a row at or above PASS_SCORE. */
  step: number;
  streak: number;
  /** Set when the last step is passed; cleared if a review fails. */
  fixedAt: number | null;
  /** How many reviews have passed since fixing, and the day the next one is due. */
  reviews: number;
  reviewDue: string | null;
}

export type SoundMasteryMap = Record<string, SoundMastery>;

export function emptyMastery(): SoundMastery {
  return { attempts: 0, ema: 0, best: 0, lastAt: 0, history: [], step: 0, streak: 0, fixedAt: null, reviews: 0, reviewDue: null };
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampScore(score: number): number {
  return Math.round(Math.min(100, Math.max(0, score)));
}

/** One scored take of a sound, from any exercise. */
export function recordScore(current: SoundMastery | undefined, score: number, at: number, day: string): SoundMastery {
  const m = current ?? emptyMastery();
  const s = clampScore(score);
  const ema = m.attempts === 0 ? s : Math.round((EMA_ALPHA * s + (1 - EMA_ALPHA) * m.ema) * 10) / 10;
  const history = [...m.history];
  const last = history[history.length - 1];
  if (last && last.day === day) {
    history[history.length - 1] = { day, takes: last.takes + 1, score: Math.round((last.score * last.takes + s) / (last.takes + 1)) };
  } else {
    history.push({ day, score: s, takes: 1 });
  }
  const cutoff = addDays(day, -HISTORY_DAYS + 1);
  return {
    ...m,
    attempts: m.attempts + 1,
    ema,
    best: Math.max(m.best, s),
    lastAt: Math.max(m.lastAt, at),
    history: history.filter((h) => h.day >= cutoff),
  };
}

/**
 * Folds one pronunciation result's phoneme scores into the map. Several
 * phonemes of the same sound in one take count as one averaged score.
 */
export function recordPhonemes(
  map: SoundMasteryMap,
  phonemes: readonly { symbol: string; accuracy: number }[],
  at: number,
  day: string,
): SoundMasteryMap {
  const sums = new Map<string, { total: number; n: number }>();
  for (const phoneme of phonemes) {
    const id = soundIdForSymbol(phoneme.symbol);
    if (!id || !Number.isFinite(phoneme.accuracy)) continue;
    const entry = sums.get(id) ?? { total: 0, n: 0 };
    entry.total += phoneme.accuracy;
    entry.n += 1;
    sums.set(id, entry);
  }
  if (sums.size === 0) return map;
  const next = { ...map };
  for (const [id, { total, n }] of sums) next[id] = recordScore(next[id], total / n, at, day);
  return next;
}

export interface SoundToFix {
  soundId: string;
  /** 0 to 1. */
  errorRate: number;
  priority: number;
  mastery: SoundMastery;
  reason: "weak" | "review";
}

/**
 * The personal list: sounds scoring under PASS_SCORE ordered by
 * error rate times how common the sound is, then fixed sounds whose review is
 * due. Sounds never heard are not on it.
 */
export function soundsToFix(
  map: SoundMasteryMap,
  today: string,
  options: { counts?: Readonly<Record<string, number>>; limit?: number } = {},
): SoundToFix[] {
  const weak: SoundToFix[] = [];
  const review: SoundToFix[] = [];
  for (const [soundId, mastery] of Object.entries(map)) {
    if (mastery.attempts === 0) continue;
    const errorRate = 1 - mastery.ema / 100;
    const priority = errorRate * frequencyWeight(soundId, options.counts);
    if (mastery.fixedAt !== null) {
      if (mastery.reviewDue !== null && mastery.reviewDue <= today) review.push({ soundId, errorRate, priority, mastery, reason: "review" });
    } else if (mastery.ema < PASS_SCORE) {
      weak.push({ soundId, errorRate, priority, mastery, reason: "weak" });
    }
  }
  weak.sort((a, b) => b.priority - a.priority || a.soundId.localeCompare(b.soundId));
  review.sort((a, b) => (a.mastery.reviewDue ?? "").localeCompare(b.mastery.reviewDue ?? ""));
  return [...weak, ...review].slice(0, options.limit ?? 10);
}

export interface DrillOutcome {
  mastery: SoundMastery;
  /** The take finished a step. */
  stepPassed: boolean;
  /** The take finished the last step: the sound is fixed. */
  fixed: boolean;
}

/** One take on the drill ladder. */
export function recordDrillTake(current: SoundMastery | undefined, score: number, at: number, day: string): DrillOutcome {
  const scored = recordScore(current, score, at, day);
  const streak = clampScore(score) >= PASS_SCORE ? scored.streak + 1 : 0;
  if (streak < TAKES_TO_PASS) return { mastery: { ...scored, streak }, stepPassed: false, fixed: false };
  const step = scored.step + 1;
  if (step < DRILL_STEPS.length) return { mastery: { ...scored, step, streak: 0 }, stepPassed: true, fixed: false };
  return {
    mastery: { ...scored, step: DRILL_STEPS.length - 1, streak: 0, fixedAt: at, reviews: 0, reviewDue: addDays(day, REVIEW_DAYS[0]) },
    stepPassed: true,
    fixed: true,
  };
}

/**
 * A spaced review of a fixed sound. Passing moves to the next interval (after
 * the last one there is nothing more due); failing un-fixes it and sends it
 * back to the word step.
 */
export function recordReview(current: SoundMastery, score: number, at: number, day: string): SoundMastery {
  const scored = recordScore(current, score, at, day);
  if (clampScore(score) >= PASS_SCORE) {
    const reviews = scored.reviews + 1;
    return { ...scored, reviews, reviewDue: reviews < REVIEW_DAYS.length ? addDays(day, REVIEW_DAYS[reviews]) : null };
  }
  return { ...scored, fixedAt: null, reviews: 0, reviewDue: null, step: DRILL_STEPS.indexOf("word"), streak: 0 };
}

export function currentStep(mastery: SoundMastery | undefined): DrillStep {
  return DRILL_STEPS[Math.min(mastery?.step ?? 0, DRILL_STEPS.length - 1)];
}

/** Last-writer-wins merge for sync: the record with the later lastAt wins per sound. */
export function mergeMastery(local: SoundMasteryMap, remote: SoundMasteryMap): SoundMasteryMap {
  const out = { ...local };
  for (const [id, record] of Object.entries(remote)) {
    if (!out[id] || record.lastAt > out[id].lastAt) out[id] = record;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drill content
// ---------------------------------------------------------------------------

/** How each sound is written in practice syllables. */
const SPELLING: Record<string, string> = {
  "sound.p": "p", "sound.b": "b", "sound.t": "t", "sound.d": "d", "sound.k": "k", "sound.g": "g",
  "sound.f": "f", "sound.v": "v", "sound.th": "th", "sound.dh": "th", "sound.s": "s", "sound.z": "z",
  "sound.sh": "sh", "sound.hh": "h", "sound.ch": "ch", "sound.jh": "j", "sound.m": "m", "sound.n": "n",
  "sound.l": "l", "sound.r": "r", "sound.w": "w", "sound.y": "y",
};

const VOWEL_SYLLABLES: Record<string, string[]> = {
  "sound.iy": ["bee", "see", "tea"], "sound.ih": ["bit", "sit", "tip"], "sound.eh": ["bet", "set", "ten"],
  "sound.ae": ["bat", "sat", "tap"], "sound.aa": ["bar", "spa", "car"], "sound.oh": ["pot", "top", "dog"],
  "sound.ao": ["saw", "law", "paw"], "sound.uh": ["put", "look", "good"], "sound.uw": ["boo", "two", "zoo"],
  "sound.ah": ["but", "sun", "cup"], "sound.ax": ["a-bout", "a-go", "so-fa"], "sound.er": ["fur", "sir", "her"],
  "sound.axr": ["bet-ter", "wa-ter", "doc-tor"], "sound.ey": ["bay", "say", "day"], "sound.ay": ["buy", "sigh", "tie"],
  "sound.oy": ["boy", "toy", "soy"], "sound.ow": ["bow", "so", "toe"], "sound.aw": ["bow", "now", "cow"],
  "sound.ia": ["near", "here", "beer"], "sound.ea": ["air", "hair", "care"], "sound.ua": ["tour", "poor", "sure"],
};

export interface DrillSources {
  /** Words with space-separated IPA, e.g. PRACTICE_TARGETS. */
  words: readonly { word: string; ipa: string }[];
  /** Minimal pairs, each with the two sounds it contrasts. */
  pairs: readonly { words: readonly [string, string]; soundIds: readonly string[] }[];
  /** Example sentences from the content packs. */
  sentences: readonly string[];
}

function wordsWithSound(soundId: string, sources: DrillSources): string[] {
  return sources.words
    .filter((entry) => entry.ipa.replace(/[/]/g, "").split(/\s+/).some((token) => soundIdForSymbol(token) === soundId))
    .map((entry) => entry.word);
}

/** What to say on a step, at most five items. Empty when the data has nothing for it. */
export function drillItems(soundId: string, example: string, step: DrillStep, sources: DrillSources): string[] {
  const words = wordsWithSound(soundId, sources);
  switch (step) {
    case "sound":
      return [example];
    case "syllable": {
      const vowel = VOWEL_SYLLABLES[soundId];
      if (vowel) return vowel;
      const c = SPELLING[soundId];
      if (!c) return [example];
      return soundId === "sound.ng" ? ["sing", "long", "ring"] : [`${c}a`, `${c}ee`, `${c}oo`, `a${c}a`];
    }
    case "word":
      return (words.length ? words : [example]).slice(0, 5);
    case "pair": {
      const pairs = sources.pairs.filter((pair) => pair.soundIds.includes(soundId));
      return pairs.slice(0, 5).map((pair) => `${pair.words[0]} / ${pair.words[1]}`);
    }
    case "phrase": {
      // Two words with the sound, joined, so it comes up twice in one breath.
      const pool = words.length ? words : [example];
      const out: string[] = [];
      for (let i = 0; i < Math.min(pool.length, 6); i += 2) out.push(`${pool[i]} and ${pool[i + 1] ?? example}`);
      return out.slice(0, 3);
    }
    case "sentence": {
      const keys = new Set((words.length ? words : [example]).map((w) => w.toLowerCase()));
      const hits = sources.sentences.filter((s) => s.toLowerCase().split(/[^a-z']+/).some((w) => keys.has(w)));
      return hits.slice(0, 5);
    }
  }
}
