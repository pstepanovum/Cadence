// FILE: src/lib/cloud/progress-logic.ts
//
// The decisions behind cloud learn progress, as pure functions over plain
// records so they are tested without Firestore (tests/cloud/progress-logic.test.ts).
// They follow the local-mode rules in src/lib/local-learn.ts: a passed module
// stays completed, the best score only goes up, and passing unlocks the next.

export const EXAM_PASS_SCORE = 70;

/** users/{uid}/moduleProgress/{moduleId}, with dates as ISO strings. */
export interface ModuleProgressRecord {
  moduleId: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  bestExamScore: number | null;
  unlockedAt: string | null;
  completedAt: string | null;
}

export function applyExamResult(input: {
  moduleId: number;
  examScore: number;
  totalModules: number;
  current: ModuleProgressRecord | null;
  next: ModuleProgressRecord | null;
  now: string;
}) {
  const { moduleId, examScore, totalModules, current, next, now } = input;
  const passed = examScore >= EXAM_PASS_SCORE;
  const completed = passed || current?.isCompleted === true;

  const updatedCurrent: ModuleProgressRecord = {
    moduleId,
    isUnlocked: true,
    isCompleted: completed,
    bestExamScore: Math.max(Math.round(examScore), current?.bestExamScore ?? 0),
    unlockedAt: current?.unlockedAt ?? now,
    completedAt: completed ? current?.completedAt ?? now : null,
  };

  const updatedNext: ModuleProgressRecord | null =
    passed && moduleId < totalModules
      ? {
          moduleId: moduleId + 1,
          isUnlocked: true,
          isCompleted: next?.isCompleted ?? false,
          bestExamScore: next?.bestExamScore ?? null,
          unlockedAt: next?.unlockedAt ?? now,
          completedAt: next?.completedAt ?? null,
        }
      : null;

  return { passed, current: updatedCurrent, next: updatedNext };
}

/** The snake_case shape the learn UI reads (`UserProgress` in src/lib/learn.ts). */
export function toUserProgress(record: ModuleProgressRecord) {
  return {
    is_unlocked: record.isUnlocked,
    is_completed: record.isCompleted,
    best_exam_score: record.bestExamScore,
    unlocked_at: record.unlockedAt,
    completed_at: record.completedAt,
  };
}

export interface EndedSessionRecord {
  id: string;
  lessonId: string;
  avgScore: number | null;
  passed: boolean | null;
}

export interface LessonSummary {
  session_id: string | null;
  attempt_count: number;
  best_score: number | null;
  passed: boolean | null;
}

/** Fold a lesson's ended sessions into the summary its card shows. */
export function summarizeLessonSessions(sessions: EndedSessionRecord[]) {
  const summaries = new Map<string, LessonSummary>();

  for (const session of sessions) {
    const existing = summaries.get(session.lessonId);

    if (!existing) {
      summaries.set(session.lessonId, {
        session_id: session.id,
        attempt_count: 1,
        best_score: session.avgScore,
        passed: session.passed,
      });
      continue;
    }

    summaries.set(session.lessonId, {
      session_id: existing.session_id,
      attempt_count: existing.attempt_count + 1,
      best_score: Math.max(existing.best_score ?? 0, session.avgScore ?? 0),
      passed: existing.passed === true || session.passed === true,
    });
  }

  return summaries;
}

/** Consecutive days, ending today, with at least one finished session (at most 60). */
export function currentStreakDays(sessionStarts: string[], today: Date) {
  const days = new Set(sessionStarts.map((start) => new Date(start).toISOString().slice(0, 10)));
  let streak = 0;

  while (streak < 60) {
    const probe = new Date(today);
    probe.setDate(today.getDate() - streak);

    if (!days.has(probe.toISOString().slice(0, 10))) {
      break;
    }

    streak += 1;
  }

  return streak;
}

export function averageScore(attemptCount: number, scoreSum: number) {
  return attemptCount > 0 ? Math.round(scoreSum / attemptCount) : 0;
}
