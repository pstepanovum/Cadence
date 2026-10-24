// FILE: src/components/mouth-map/sound-practice.ts
//
// Sound-by-sound diagnosis and drilling, pure so tests/web/sound-practice.test.ts
// covers it. Phoneme scores from pronunciation results feed a per-sound record
// (the same shape as users/{uid}/mastery/sounds in docs/PLATFORM.md section 5);
// from those the learner gets a "sounds to fix" list ordered by error rate
// times how common the sound is, a drill ladder from the sound alone up to a
// sentence, and spaced review of sounds already fixed.

export interface SoundRecord {
  attempts: number;
  /** Exponential moving average of the 0-100 scores. */
  ema: number;
  best: number;
  lastAt: number;
  /** One entry per day, the day's last score, at most 30 days. */
  history: { day: string; score: number }[];
  /** Drill progress, see DRILL_STEPS. */
  drill?: DrillState;
  /** Set when the last drill step was passed: the sound is fixed and reviewed on a schedule. */
  fixedAt?: string;
}

export type SoundStore = Record<string, SoundRecord>;

const EMA_WEIGHT = 0.3;
const HISTORY_DAYS = 30;
/** At or above this score a take counts as good. */
export const GOOD_SCORE = 80;

/**
 * How common each sound is in running English speech, relative to the most
 * common (schwa = 1). Provisional estimates; the content pipeline replaces
 * them with our own count over the Tatoeba English sentences.
 */
export const SOUND_FREQUENCY: Record<string, number> = {
  "sound.ax": 1, "sound.n": 0.72, "sound.t": 0.7, "sound.ih": 0.66, "sound.s": 0.47, "sound.r": 0.45,
  "sound.d": 0.42, "sound.l": 0.42, "sound.dh": 0.36, "sound.iy": 0.34, "sound.k": 0.34, "sound.m": 0.32,
  "sound.z": 0.3, "sound.eh": 0.29, "sound.w": 0.26, "sound.ae": 0.26, "sound.p": 0.24, "sound.v": 0.23,
  "sound.b": 0.22, "sound.f": 0.2, "sound.hh": 0.18, "sound.ey": 0.18, "sound.ay": 0.18, "sound.ah": 0.18,
  "sound.aa": 0.16, "sound.uw": 0.16, "sound.ng": 0.13, "sound.ow": 0.13, "sound.er": 0.12, "sound.axr": 0.12,
  "sound.ao": 0.11, "sound.sh": 0.1, "sound.y": 0.1, "sound.g": 0.1, "sound.oh": 0.1, "sound.jh": 0.07,
  "sound.ch": 0.06, "sound.th": 0.06, "sound.uh": 0.06, "sound.aw": 0.05, "sound.zh": 0.01, "sound.oy": 0.01,
  "sound.ia": 0.03, "sound.ea": 0.02, "sound.ua": 0.01,
};

export function recordScore(store: SoundStore, soundId: string, score: number, now: Date): SoundStore {
  const clamped = Math.round(Math.min(100, Math.max(0, score)));
  const day = localDay(now);
  const prev = store[soundId];
  const history = (prev?.history ?? []).filter((entry) => entry.day !== day);
  history.push({ day, score: clamped });
  const record: SoundRecord = {
    ...prev,
    attempts: (prev?.attempts ?? 0) + 1,
    ema: prev ? prev.ema + EMA_WEIGHT * (clamped - prev.ema) : clamped,
    best: Math.max(prev?.best ?? 0, clamped),
    lastAt: now.getTime(),
    history: history.slice(-HISTORY_DAYS),
  };
  return { ...store, [soundId]: record };
}

export interface SoundToFix {
  soundId: string;
  score: number;
  attempts: number;
  priority: number;
}

/** Sounds below a good score, most worth fixing first. */
export function soundsToFix(store: SoundStore, limit = 8): SoundToFix[] {
  return Object.entries(store)
    .filter(([, record]) => record.attempts > 0 && record.ema < GOOD_SCORE)
    .map(([soundId, record]) => ({
      soundId,
      score: Math.round(record.ema),
      attempts: record.attempts,
      priority: (1 - record.ema / 100) * (SOUND_FREQUENCY[soundId] ?? 0.05),
    }))
    .sort((a, b) => b.priority - a.priority || a.soundId.localeCompare(b.soundId))
    .slice(0, limit);
}

export const DRILL_STEPS = ["sound", "syllable", "word", "minimal_pair", "phrase", "sentence"] as const;
export type DrillStep = (typeof DRILL_STEPS)[number];

export const DRILL_STEP_LABELS: Record<DrillStep, string> = {
  sound: "The sound alone",
  syllable: "In a syllable",
  word: "In a word",
  minimal_pair: "Against its look-alike",
  phrase: "In a phrase",
  sentence: "In a sentence",
};

/** Good takes in a row needed to pass a step. */
export const TAKES_TO_PASS = 3;

export interface DrillState {
  step: number;
  streak: number;
}

/** The drill after one take; passing the last step marks the sound fixed. */
export function advanceDrill(state: DrillState | undefined, score: number): { state: DrillState; passedStep: boolean; finished: boolean } {
  const current = state ?? { step: 0, streak: 0 };
  if (current.step >= DRILL_STEPS.length) return { state: current, passedStep: false, finished: true };
  const streak = score >= GOOD_SCORE ? current.streak + 1 : 0;
  if (streak < TAKES_TO_PASS) return { state: { step: current.step, streak }, passedStep: false, finished: false };
  const step = current.step + 1;
  return { state: { step, streak: 0 }, passedStep: true, finished: step >= DRILL_STEPS.length };
}

/** Days after fixing a sound when it comes back for review. */
export const REVIEW_DAYS = [1, 3, 7, 21] as const;

/** Fixed sounds with a review due on or before today. */
export function reviewsDue(store: SoundStore, today: string): string[] {
  return Object.entries(store)
    .filter(([, record]) => {
      if (!record.fixedAt) return false;
      const lastReview = record.history.at(-1)?.day ?? record.fixedAt;
      return REVIEW_DAYS.some((days) => {
        const due = shiftDay(record.fixedAt!, days);
        return due <= today && lastReview < due;
      });
    })
    .map(([soundId]) => soundId)
    .sort();
}

export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
