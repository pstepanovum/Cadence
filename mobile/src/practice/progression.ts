// Pure progression rules: what counts as a pass, which lesson comes next, and
// which lessons a learner may open. Mirrors the web app's Learn flow.
//
// No React / React Native imports — unit tested under mobile/tests/.

import { averageScore } from "./scoring.ts";

export type LessonKind = "theory" | "practice" | "exam";

/** A practice lesson is a pass at 80; an exam unlocks the next module at 70. */
export const PRACTICE_PASS = 80;
export const EXAM_PASS = 70;

export function passMark(kind: LessonKind): number {
  return kind === "exam" ? EXAM_PASS : PRACTICE_PASS;
}

export function didPass(kind: LessonKind, scores: readonly number[]): boolean {
  if (kind === "theory") return true;
  if (scores.length === 0) return false;
  return averageScore(scores) >= passMark(kind);
}

export interface LessonLike {
  id: string;
  lesson_type: LessonKind;
  sort_order: number;
  /**
   * Absent entirely for a signed-out reader, null when the lesson has never
   * been finished, and only populated from `lesson_sessions` rows that have an
   * `ended_at` — which is why the theory screen has to close its own session.
   */
  session_summary?: { passed: boolean | null; best_score: number | null } | null;
}

function inOrder<T extends LessonLike>(lessons: readonly T[]): T[] {
  return lessons.slice().sort((a, b) => a.sort_order - b.sort_order);
}

export function isCleared(lesson: LessonLike): boolean {
  const summary = lesson.session_summary;
  if (!summary) return false;
  if (lesson.lesson_type === "theory") {
    // Theory has nothing to score, so finishing the session at all counts as
    // read. The lesson screen closes it when the learner taps "Mark as read".
    return true;
  }
  if (summary.passed === true) return true;
  return (summary.best_score ?? 0) >= passMark(lesson.lesson_type);
}

/**
 * The exam is the gate: it stays locked until every lesson before it has been
 * cleared, so nobody can skip straight to it. Theory and practice lessons are
 * always open, matching the web app, where the curriculum is a suggestion up
 * to the point where it grants progress.
 */
export function isLessonUnlocked<T extends LessonLike>(
  lessons: readonly T[],
  lessonId: string,
): boolean {
  const ordered = inOrder(lessons);
  const index = ordered.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return false;
  if (ordered[index].lesson_type !== "exam") return true;
  return ordered.slice(0, index).every(isCleared);
}

/** Why an exam is locked, phrased for the learner. Null when it is open. */
export function lockReason<T extends LessonLike>(
  lessons: readonly T[],
  lessonId: string,
): string | null {
  if (isLessonUnlocked(lessons, lessonId)) return null;
  const remaining = inOrder(lessons)
    .filter((lesson) => lesson.lesson_type !== "exam" && !isCleared(lesson))
    .length;
  if (remaining === 0) return "Finish the lessons above first.";
  return remaining === 1
    ? "Finish the lesson above to unlock the exam."
    : `Finish the ${remaining} lessons above to unlock the exam.`;
}

/** The lesson to push the learner towards next, or null when the module is done. */
export function nextLesson<T extends LessonLike>(lessons: readonly T[]): T | null {
  const ordered = inOrder(lessons);
  return ordered.find((lesson) => !isCleared(lesson)) ?? null;
}

/** The lesson that follows `lessonId`, for the "next up" button on a summary. */
export function lessonAfter<T extends LessonLike>(
  lessons: readonly T[],
  lessonId: string,
): T | null {
  const ordered = inOrder(lessons);
  const index = ordered.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0 || index + 1 >= ordered.length) return null;
  return ordered[index + 1];
}

/** 0-100 completion of a module, counting cleared lessons. */
export function moduleCompletion(lessons: readonly LessonLike[]): number {
  if (lessons.length === 0) return 0;
  const cleared = lessons.filter(isCleared).length;
  return Math.round((cleared / lessons.length) * 100);
}

// --- Conversation scenarios ---

export interface ScenarioLike {
  slug: string;
  title: string;
  sortOrder: number;
  passScore: number;
  isUnlocked: boolean;
  isCompleted: boolean;
}

export function scenarioPassed(passScore: number, scores: readonly number[]): boolean {
  if (scores.length === 0) return false;
  return averageScore(scores) >= passScore;
}

/** The scenario to open next: the first unlocked one that is not yet passed. */
export function nextScenario<T extends ScenarioLike>(scenarios: readonly T[]): T | null {
  return (
    scenarios
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((scenario) => scenario.isUnlocked && !scenario.isCompleted) ?? null
  );
}

/** Copy for a locked scenario card, so a lock is never unexplained. */
export function scenarioLockReason<T extends ScenarioLike>(
  scenarios: readonly T[],
  slug: string,
): string | null {
  const ordered = scenarios.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((scenario) => scenario.slug === slug);
  if (index < 0 || ordered[index].isUnlocked) return null;
  const previous = ordered[index - 1];
  return previous
    ? `Pass "${previous.title}" with ${previous.passScore} or higher to unlock this scenario.`
    : "Complete the earlier scenarios to unlock this one.";
}
