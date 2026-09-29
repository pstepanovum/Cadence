// Pure scoring-display logic, shared by every practice loop.
//
// Thresholds mirror the web app: a phoneme/word is "correct" from 70, "mixed"
// from 50, and "needs-work" below that. The audio cue after an assessment
// plays the positive sound above 50 (src/lib/audio-feedback.ts on web).
//
// Kept free of React and React Native imports so it can be unit tested with
// the plain `node --test` runner (see mobile/tests/).

export type ScoreStatus = "correct" | "mixed" | "needs-work";

export const SCORE_GOOD = 70;
export const SCORE_OK = 50;

/** Clamps anything the engine returns into a displayable 0-100 integer. */
export function normalizeScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  // Clamp before rounding so an Infinity from a divide-by-zero reads as 100
  // rather than collapsing to 0 and looking like a terrible take.
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function scoreStatus(score: number): ScoreStatus {
  const value = normalizeScore(score);
  if (value >= SCORE_GOOD) return "correct";
  if (value >= SCORE_OK) return "mixed";
  return "needs-work";
}

/** Short headline for a finished take. */
export function scoreLabel(score: number): string {
  const status = scoreStatus(score);
  if (status === "correct") return "Sounds great";
  if (status === "mixed") return "Close — tighten it up";
  return "Needs work";
}

/** Whether the post-assessment cue should be the positive one. */
export function isEncouraging(score: number): boolean {
  return normalizeScore(score) > SCORE_OK;
}

/** Mean of a run of takes, rounded, matching what the server is sent. */
export function averageScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((sum, value) => sum + normalizeScore(value), 0);
  return Math.round(total / scores.length);
}

/** The best take of a run; 0 when there are none. */
export function bestScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((best, value) => Math.max(best, normalizeScore(value)), 0);
}

/**
 * Progress through a queue of `total` items, as a percentage. `done` items are
 * behind you; the bar reads full only once the last one is scored, which is why
 * this takes the completed count rather than the current index.
 */
export function queueProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, Math.min(total, done)) / total) * 100);
}

export interface PhonemeLike {
  symbol: string;
  heard: string;
  accuracy: number;
  status: ScoreStatus;
}

/**
 * Caption under a phoneme tile: what went wrong if it did, the accuracy if it
 * did not. Keeps the tile readable when the engine sends an empty `heard`.
 */
export function phonemeCaption(phoneme: PhonemeLike): string {
  if (phoneme.status === "needs-work" && phoneme.heard.trim()) {
    return `heard ${phoneme.heard.trim()}`;
  }
  return `${normalizeScore(phoneme.accuracy)}%`;
}

/** The phonemes worth drilling next, worst first, capped at `limit`. */
export function weakestPhonemes<T extends PhonemeLike>(
  phonemes: readonly T[],
  limit = 3,
): T[] {
  return phonemes
    .filter((phoneme) => phoneme.status !== "correct")
    .slice()
    .sort((a, b) => normalizeScore(a.accuracy) - normalizeScore(b.accuracy))
    .slice(0, limit);
}
