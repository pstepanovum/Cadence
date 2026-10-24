// Today at a glance: the streak (this phone's, or the account's when another
// device has a longer one), minutes against the daily goal, and the week.
// Pure, so it is unit tested (tests/engagement.test.ts).
import type { LearningState } from "../learning/state.ts";
import { currentStreak, shiftDay } from "../platform/progress-model.ts";
import { streakStatus, type StreakStatus } from "./streak.ts";

export const DAILY_GOAL_OPTIONS = [5, 10, 15, 20] as const;
export type DailyGoal = (typeof DAILY_GOAL_OPTIONS)[number];
export const DEFAULT_DAILY_GOAL: DailyGoal = 10;

export function isDailyGoal(value: unknown): value is DailyGoal {
  return DAILY_GOAL_OPTIONS.includes(value as DailyGoal);
}

export interface TodayStatus {
  today: string;
  streak: StreakStatus;
  goalMinutes: number;
  minutesToday: number;
  goalMet: boolean;
  /** 0 to 1. */
  goalProgress: number;
  /** Minutes on each of the last seven days, oldest first, today last. */
  week: { day: string; minutes: number }[];
  weekMinutes: number;
}

export function todayStatus(state: LearningState, today: string, goalMinutes: number): TodayStatus {
  const days = state.activity.days;
  const local = streakStatus(Object.keys(days).filter((d) => (days[d] ?? 0) > 0), today);
  // Another device of the same account may be further along; the account's
  // summary says so. Freezes are this phone's own.
  const account = currentStreak(state.summary, today);
  const accountToday = state.summary.streak.lastDay === today;
  const streak: StreakStatus =
    account > local.current
      ? { ...local, current: account, best: Math.max(local.best, state.summary.streak.best), practisedToday: local.practisedToday || accountToday, atRisk: !(local.practisedToday || accountToday) }
      : { ...local, best: Math.max(local.best, state.summary.streak.best) };
  const minutesToday = Math.round(days[today] ?? 0);
  const goal = Math.max(1, goalMinutes);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    return { day, minutes: Math.round(days[day] ?? 0) };
  });
  return {
    today,
    streak,
    goalMinutes: goal,
    minutesToday,
    goalMet: minutesToday >= goal,
    goalProgress: Math.min(1, minutesToday / goal),
    week,
    weekMinutes: week.reduce((sum, d) => sum + d.minutes, 0),
  };
}

/** Flashcards falling due on each day, from the scheduler's state. */
export function dueByDay(state: LearningState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of Object.values(state.cards)) {
    if (!card.due) continue;
    counts[card.due] = (counts[card.due] ?? 0) + 1;
  }
  return counts;
}

/** Cards due today or overdue. */
export function dueToday(state: LearningState, today: string): number {
  return Object.values(state.cards).filter((card) => card.due && card.due <= today).length;
}
