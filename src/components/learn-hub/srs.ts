// FILE: src/components/learn-hub/srs.ts
//
// The web's flashcard scheduler: the same trimmed SM-2 and the same CardState
// as mobile/src/games/srs.ts, plus the content model's "hard" grade. When the
// shared src/lib/platform/srs.ts lands (docs/PLATFORM.md section 2), this file
// becomes a re-export of it. Pure; tests/web/srs.test.ts covers it.

export type Grade = "again" | "hard" | "good" | "easy";

export interface CardState {
  reps: number;
  interval: number;
  ease: number;
  /** Calendar day due (YYYY-MM-DD), "" for a card never reviewed. */
  due: string;
  lapses: number;
}

export const MIN_EASE = 1.3;
export const NEW_CARD: CardState = { reps: 0, interval: 0, ease: 2.5, due: "", lapses: 0 };

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isDue(card: CardState | undefined, now: Date): boolean {
  return Boolean(card && card.due !== "" && card.due <= dayKey(now));
}

export function review(card: CardState | undefined, grade: Grade, now: Date): CardState {
  const current = card ?? NEW_CARD;
  if (grade === "again") {
    return {
      reps: 0,
      interval: 0,
      ease: Math.max(MIN_EASE, current.ease - 0.2),
      due: dayKey(now),
      lapses: current.due === "" ? current.lapses : current.lapses + 1,
    };
  }
  const reps = current.reps + 1;
  const ease =
    grade === "easy" ? current.ease + 0.15 : grade === "hard" ? Math.max(MIN_EASE, current.ease - 0.15) : current.ease;
  let interval: number;
  if (reps === 1) interval = grade === "easy" ? 3 : 1;
  else if (reps === 2) interval = grade === "easy" ? 7 : grade === "hard" ? 2 : 3;
  else interval = Math.round(current.interval * (grade === "hard" ? 1.2 : grade === "easy" ? ease * 1.3 : ease));
  interval = Math.max(1, interval);
  return { reps, interval, ease, due: dayKey(addDays(now, interval)), lapses: current.lapses };
}

/** Today's queue: due cards first (oldest due first), then up to `newLimit` new ones. */
export function buildQueue(cardIds: readonly string[], states: Readonly<Record<string, CardState>>, now: Date, newLimit = 10): string[] {
  const due = cardIds.filter((id) => isDue(states[id], now)).sort((a, b) => states[a].due.localeCompare(states[b].due));
  const fresh = cardIds.filter((id) => !states[id] || states[id].due === "").slice(0, newLimit);
  return [...due, ...fresh];
}
