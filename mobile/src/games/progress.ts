// What the games remember about a learner, and the pure rules for updating it.
// Persistence lives in src/games/store.ts; this file is storage-free so it can
// be tested with node --test (mobile/tests/progress.test.ts).

import { dayKey, review, type CardState, type Grade } from "./srs.ts";

export type GameId = "flashcards" | "spelling" | "scramble" | "sound-match" | "meaning-match";

export interface GameResult {
  gameId: GameId;
  score: number;
  /** 0-100. */
  accuracy: number;
  correct: number;
  total: number;
  /** ISO timestamp. */
  playedAt: string;
  /** Deck level or pair group the round used, for the history list. */
  label?: string;
}

export interface GameProgress {
  v: 1;
  cards: Record<string, CardState>;
  /** Newest first, capped. */
  results: GameResult[];
  bests: Partial<Record<GameId, number>>;
  /** Calendar days with at least one finished round, newest first, capped. */
  days: string[];
}

export const MAX_RESULTS = 100;
export const MAX_DAYS = 90;

export function emptyProgress(): GameProgress {
  return { v: 1, cards: {}, results: [], bests: {}, days: [] };
}

/** Tolerant parse: anything malformed collapses to the default. */
export function parseProgress(raw: unknown): GameProgress {
  const base = emptyProgress();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<GameProgress>;

  if (value.cards && typeof value.cards === "object") {
    for (const [id, card] of Object.entries(value.cards)) {
      if (
        card &&
        typeof card === "object" &&
        typeof card.reps === "number" &&
        typeof card.interval === "number" &&
        typeof card.ease === "number" &&
        typeof card.due === "string" &&
        typeof card.lapses === "number"
      ) {
        base.cards[id] = { reps: card.reps, interval: card.interval, ease: card.ease, due: card.due, lapses: card.lapses };
      }
    }
  }
  if (Array.isArray(value.results)) {
    base.results = value.results
      .filter(
        (item): item is GameResult =>
          !!item && typeof item === "object" && typeof item.gameId === "string" && typeof item.score === "number",
      )
      .slice(0, MAX_RESULTS);
  }
  if (value.bests && typeof value.bests === "object") {
    for (const [gameId, best] of Object.entries(value.bests)) {
      if (typeof best === "number") base.bests[gameId as GameId] = best;
    }
  }
  if (Array.isArray(value.days)) {
    base.days = value.days.filter((day): day is string => typeof day === "string").slice(0, MAX_DAYS);
  }
  return base;
}

export function recordResult(progress: GameProgress, result: GameResult, now: Date): GameProgress {
  const today = dayKey(now);
  const days = progress.days.includes(today) ? progress.days : [today, ...progress.days].slice(0, MAX_DAYS);
  const previousBest = progress.bests[result.gameId] ?? 0;
  return {
    ...progress,
    results: [result, ...progress.results].slice(0, MAX_RESULTS),
    bests: { ...progress.bests, [result.gameId]: Math.max(previousBest, result.score) },
    days,
  };
}

export function applyReview(progress: GameProgress, wordId: string, grade: Grade, now: Date): GameProgress {
  return {
    ...progress,
    cards: { ...progress.cards, [wordId]: review(progress.cards[wordId], grade, now) },
  };
}

/** Consecutive days of play ending today or yesterday. */
export function playStreak(days: readonly string[], now: Date): number {
  const set = new Set(days);
  let cursor = new Date(now);
  // A streak is still alive if the last round was yesterday.
  if (!set.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function roundsPlayed(progress: GameProgress, gameId?: GameId): number {
  if (!gameId) return progress.results.length;
  return progress.results.filter((result) => result.gameId === gameId).length;
}
