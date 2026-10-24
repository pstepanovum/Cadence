// FILE: mobile/src/platform/progress-model.ts
//
// The one progress document every signed-in account has in Firestore
// (users/{uid}/progress/summary): streak, minutes, lessons per level, last
// active, and the 20 most recent results. It is all a free account keeps in
// the cloud and the header of a Plus account's full progress. Pure, so the
// phone, the web and the server update it the same way. docs/PLATFORM.md is
// the written spec.
//
// Twin: src/lib/platform/progress-model.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

import { CEFR_LEVELS, type CefrLevel } from "./content-model.ts";

/**
 * Bumped when the summary's shape changes; readers migrate older documents.
 */
export const SUMMARY_SCHEMA_VERSION = 1;

/** The capped list keeps the document small and the read cheap. */
export const RECENT_RESULTS_CAP = 20;

export const ACTIVITY_KINDS = [
  "lesson",
  "quiz",
  "flashcards",
  "matching",
  "sentence_building",
  "pronunciation",
  "shadowing",
  "coach",
  "placement",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface RecentResult {
  kind: ActivityKind;
  /** The lesson, exercise set, sound or scenario id. */
  refId: string;
  level: CefrLevel | null;
  /** 0 to 100, or null when the activity has no score (a coach chat). */
  score: number | null;
  /** Epoch milliseconds. */
  at: number;
}

export interface ProgressSummary {
  schema: number;
  streak: {
    current: number;
    best: number;
    /** The learner's local calendar day (YYYY-MM-DD) of the last activity. */
    lastDay: string | null;
  };
  totalMinutes: number;
  lessonsCompleted: Record<CefrLevel, number>;
  placementLevel: CefrLevel | null;
  lastActiveAt: number | null;
  recent: RecentResult[];
}

export interface Activity {
  kind: ActivityKind;
  refId: string;
  level: CefrLevel | null;
  score: number | null;
  minutes: number;
  /** The learner's local day, computed on the device. */
  day: string;
  at: number;
  /** True once, when a lesson is finished for the first time. */
  completedLesson?: boolean;
  /** Set by a finished placement test. */
  placementLevel?: CefrLevel;
}

export function emptySummary(): ProgressSummary {
  const lessonsCompleted = {} as Record<CefrLevel, number>;
  for (const level of CEFR_LEVELS) lessonsCompleted[level] = 0;
  return {
    schema: SUMMARY_SCHEMA_VERSION,
    streak: { current: 0, best: 0, lastDay: null },
    totalMinutes: 0,
    lessonsCompleted,
    placementLevel: null,
    lastActiveAt: null,
    recent: [],
  };
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The calendar day after (or, with -1, before) a YYYY-MM-DD day. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The streak to show today: it survives until the end of the day after the last activity. */
export function currentStreak(summary: ProgressSummary, today: string): number {
  const last = summary.streak.lastDay;
  if (!last) return 0;
  return last === today || shiftDay(last, 1) === today ? summary.streak.current : 0;
}

/**
 * The summary after one activity. Never mutates its input. An activity dated
 * before the last active day (a late sync) counts towards minutes and results
 * but leaves the streak alone.
 */
export function applyActivity(summary: ProgressSummary, activity: Activity): ProgressSummary {
  if (!isDayKey(activity.day)) throw new Error(`Bad day ${activity.day}; expected YYYY-MM-DD.`);
  const next: ProgressSummary = {
    ...summary,
    streak: { ...summary.streak },
    lessonsCompleted: { ...summary.lessonsCompleted },
  };

  const last = summary.streak.lastDay;
  if (last === null || activity.day > last) {
    next.streak.current = last !== null && shiftDay(last, 1) === activity.day ? summary.streak.current + 1 : 1;
    next.streak.best = Math.max(summary.streak.best, next.streak.current);
    next.streak.lastDay = activity.day;
  }

  next.totalMinutes = summary.totalMinutes + Math.max(0, activity.minutes);
  if (activity.completedLesson && activity.level) {
    next.lessonsCompleted[activity.level] = (summary.lessonsCompleted[activity.level] ?? 0) + 1;
  }
  if (activity.placementLevel) next.placementLevel = activity.placementLevel;
  next.lastActiveAt = Math.max(summary.lastActiveAt ?? 0, activity.at);

  const score = activity.score === null ? null : Math.round(Math.min(100, Math.max(0, activity.score)));
  const result: RecentResult = { kind: activity.kind, refId: activity.refId, level: activity.level, score, at: activity.at };
  next.recent = [result, ...summary.recent].sort((a, b) => b.at - a.at).slice(0, RECENT_RESULTS_CAP);
  return next;
}
