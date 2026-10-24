// FILE: mobile/src/platform/srs.ts
//
// Spaced repetition for flashcards, a trimmed SM-2, shared by every client:
// the phone's deck, the web and the Plus sync all schedule cards the same way.
// A card has an ease factor and an interval in days. "Again" resets it to
// today, "Hard" grows the interval a little and lowers the ease, "Good" grows
// it by the ease, "Easy" grows it faster and nudges the ease up. Dates are local calendar days (YYYY-MM-DD), because a
// learner thinks in "due today", not in milliseconds.
//
// Pure: no React, no storage. Tested in tests/platform/srs.test.ts.
//
// Twin: src/lib/platform/srs.ts, byte-identical below this header, checked
// by tests/platform/drift.test.ts.

/** How the learner rated a review. */
export type Grade = "again" | "hard" | "good" | "easy";

export interface CardState {
  /** Successful reviews in a row. */
  reps: number;
  /** Days until the next review, as of the last review. */
  interval: number;
  /** SM-2 ease factor; never below MIN_EASE. */
  ease: number;
  /** Calendar day the card is next due, or "" for a card never reviewed. */
  due: string;
  /** Times the learner has forgotten it after learning it. */
  lapses: number;
}

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

/** Intervals that count as "known" and "mastered" on the hub. */
export const KNOWN_DAYS = 7;
export const MASTERED_DAYS = 21;

export const NEW_CARD: CardState = { reps: 0, interval: 0, ease: DEFAULT_EASE, due: "", lapses: 0 };

export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isNew(card: CardState | undefined): boolean {
  return !card || card.due === "";
}

export function isDue(card: CardState | undefined, now: Date): boolean {
  if (!card || card.due === "") return false;
  return card.due <= dayKey(now);
}

export type Mastery = "new" | "learning" | "known" | "mastered";

export function mastery(card: CardState | undefined): Mastery {
  if (isNew(card)) return "new";
  if (card!.interval >= MASTERED_DAYS) return "mastered";
  if (card!.interval >= KNOWN_DAYS) return "known";
  return "learning";
}

export function review(card: CardState | undefined, grade: Grade, now: Date): CardState {
  const current = card ?? NEW_CARD;

  if (grade === "again") {
    return {
      reps: 0,
      interval: 0,
      ease: Math.max(MIN_EASE, current.ease - 0.2),
      // Due again today so it comes back within the same session.
      due: dayKey(now),
      lapses: isNew(current) ? current.lapses : current.lapses + 1,
    };
  }

  const reps = current.reps + 1;
  let interval: number;
  let ease = current.ease;

  if (grade === "hard") {
    interval = reps === 1 ? 1 : reps === 2 ? 2 : Math.round(current.interval * 1.2);
    ease = Math.max(MIN_EASE, current.ease - 0.15);
  } else if (grade === "good") {
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(current.interval * current.ease);
  } else {
    interval = reps === 1 ? 3 : Math.round(Math.max(current.interval, 1) * current.ease * 1.3);
    ease = current.ease + 0.15;
  }

  interval = Math.max(1, interval);

  return {
    reps,
    interval,
    ease,
    due: dayKey(addDays(now, interval)),
    lapses: current.lapses,
  };
}

export interface SessionPlan {
  /** Card ids in the order to show them. */
  ids: string[];
  dueCount: number;
  newCount: number;
}

/**
 * Picks today's cards: everything due, oldest first, then unseen cards up to
 * `newLimit`. `ids` is the full deck in its canonical order; the plan keeps
 * that order for new cards so a learner meets the deck front to back.
 */
export function planSession(
  ids: readonly string[],
  cards: Readonly<Record<string, CardState>>,
  now: Date,
  options: { newLimit?: number; reviewLimit?: number } = {},
): SessionPlan {
  const newLimit = options.newLimit ?? 8;
  const reviewLimit = options.reviewLimit ?? 12;

  const due = ids
    .filter((id) => isDue(cards[id], now))
    .sort((a, b) => (cards[a]!.due < cards[b]!.due ? -1 : cards[a]!.due > cards[b]!.due ? 1 : 0))
    .slice(0, reviewLimit);

  const fresh = ids.filter((id) => isNew(cards[id])).slice(0, newLimit);

  return { ids: [...due, ...fresh], dueCount: due.length, newCount: fresh.length };
}

export interface DeckSummary {
  total: number;
  new: number;
  learning: number;
  known: number;
  mastered: number;
  dueToday: number;
}

export function summarizeDeck(
  ids: readonly string[],
  cards: Readonly<Record<string, CardState>>,
  now: Date,
): DeckSummary {
  const summary: DeckSummary = { total: ids.length, new: 0, learning: 0, known: 0, mastered: 0, dueToday: 0 };
  for (const id of ids) {
    const card = cards[id];
    summary[mastery(card)] += 1;
    if (isDue(card, now)) summary.dueToday += 1;
  }
  return summary;
}
