// The daily streak the phone shows, counted by the learner's local calendar
// day, with streak freezes: every 7 days in a row earns one (at most
// MAX_FREEZES banked), and a missed day spends one instead of ending the
// streak. Recomputed from the list of days practised, so it never drifts.
// Pure, so it is unit tested (tests/engagement.test.ts).
import { shiftDay } from "../platform/progress-model.ts";

/** A freeze is earned for every this many days in a row. */
export const FREEZE_EVERY = 7;
/** Freezes kept in the bank; more are not earned until one is spent. */
export const MAX_FREEZES = 2;
/** How many days of history the phone keeps for the streak. */
export const ACTIVE_DAYS_KEPT = 400;

export interface StreakStatus {
  /** Days in the current streak, frozen days not counted. */
  current: number;
  /** Longest streak in the kept history. */
  best: number;
  /** Freezes in the bank now. */
  freezes: number;
  /** Days a freeze covered, oldest first (within the current streak). */
  frozenDays: string[];
  practisedToday: boolean;
  /** A streak is running and today has no practice yet. */
  atRisk: boolean;
}

/** Days with practice, unique and sorted, trimmed to the history kept. */
export function normaliseDays(days: readonly string[], today: string): string[] {
  const unique = [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today))].sort();
  return unique.slice(-ACTIVE_DAYS_KEPT);
}

export function streakStatus(days: readonly string[], today: string): StreakStatus {
  const active = normaliseDays(days, today);
  const set = new Set(active);
  const practisedToday = set.has(today);
  if (active.length === 0) return { current: 0, best: 0, freezes: 0, frozenDays: [], practisedToday: false, atRisk: false };

  let current = 0;
  let best = 0;
  let freezes = 0;
  let frozenDays: string[] = [];
  // Walk every day from the first one practised up to yesterday; today is
  // still open, so a day without practice yet never breaks anything.
  for (let day = active[0]; day < today; day = shiftDay(day, 1)) {
    if (set.has(day)) {
      current += 1;
      if (current % FREEZE_EVERY === 0 && freezes < MAX_FREEZES) freezes += 1;
    } else if (current > 0 && freezes > 0) {
      freezes -= 1;
      frozenDays.push(day);
    } else {
      current = 0;
      frozenDays = [];
    }
    best = Math.max(best, current);
  }
  if (practisedToday) {
    current += 1;
    if (current % FREEZE_EVERY === 0 && freezes < MAX_FREEZES) freezes += 1;
    best = Math.max(best, current);
  }
  if (current === 0) frozenDays = [];
  return { current, best, freezes, frozenDays, practisedToday, atRisk: current > 0 && !practisedToday };
}

/** Days until the next freeze is earned, or null when the bank is full. */
export function daysToNextFreeze(status: StreakStatus): number | null {
  if (status.freezes >= MAX_FREEZES) return null;
  const into = status.current % FREEZE_EVERY;
  return FREEZE_EVERY - into;
}
