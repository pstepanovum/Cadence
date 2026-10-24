// FILE: tests/cloud/progress-logic.test.ts
//
// Cloud learn progress follows the same rules as local mode: a passed module
// stays completed, the best score never drops, and passing unlocks the next.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyExamResult,
  averageScore,
  currentStreakDays,
  summarizeLessonSessions,
  toUserProgress,
  type ModuleProgressRecord,
} from "../../src/lib/cloud/progress-logic.ts";

const NOW = "2026-10-23T12:00:00.000Z";
const EARLIER = "2026-10-01T09:00:00.000Z";

function progress(overrides: Partial<ModuleProgressRecord> = {}): ModuleProgressRecord {
  return {
    moduleId: 1,
    isUnlocked: true,
    isCompleted: false,
    bestExamScore: null,
    unlockedAt: EARLIER,
    completedAt: null,
    ...overrides,
  };
}

describe("recording an exam", () => {
  it("completes the module and unlocks the next one on a pass", () => {
    const result = applyExamResult({
      moduleId: 1,
      examScore: 82.4,
      totalModules: 10,
      current: progress(),
      next: null,
      now: NOW,
    });

    assert.equal(result.passed, true);
    assert.deepEqual(result.current, progress({ isCompleted: true, bestExamScore: 82, completedAt: NOW }));
    assert.deepEqual(result.next, {
      moduleId: 2,
      isUnlocked: true,
      isCompleted: false,
      bestExamScore: null,
      unlockedAt: NOW,
      completedAt: null,
    });
  });

  it("passes at exactly 70", () => {
    const result = applyExamResult({ moduleId: 3, examScore: 70, totalModules: 10, current: null, next: null, now: NOW });
    assert.equal(result.passed, true);
    assert.equal(result.next?.moduleId, 4);
  });

  it("keeps a failed module unlocked, uncompleted and with no next unlock", () => {
    const result = applyExamResult({ moduleId: 1, examScore: 69, totalModules: 10, current: progress(), next: null, now: NOW });
    assert.equal(result.passed, false);
    assert.equal(result.current.isCompleted, false);
    assert.equal(result.current.completedAt, null);
    assert.equal(result.current.bestExamScore, 69);
    assert.equal(result.next, null);
  });

  it("never lowers the best score or un-completes a module on a worse retake", () => {
    const current = progress({ isCompleted: true, bestExamScore: 90, completedAt: EARLIER });
    const result = applyExamResult({ moduleId: 1, examScore: 40, totalModules: 10, current, next: null, now: NOW });
    assert.equal(result.current.bestExamScore, 90);
    assert.equal(result.current.isCompleted, true);
    assert.equal(result.current.completedAt, EARLIER);
  });

  it("keeps the first unlock date of a module that was already unlocked", () => {
    const next = progress({ moduleId: 2, unlockedAt: EARLIER, bestExamScore: 55 });
    const result = applyExamResult({ moduleId: 1, examScore: 95, totalModules: 10, current: progress(), next, now: NOW });
    assert.equal(result.next?.unlockedAt, EARLIER);
    assert.equal(result.next?.bestExamScore, 55);
  });

  it("unlocks nothing past the last module", () => {
    const result = applyExamResult({ moduleId: 10, examScore: 100, totalModules: 10, current: null, next: null, now: NOW });
    assert.equal(result.passed, true);
    assert.equal(result.next, null);
    assert.equal(result.current.unlockedAt, NOW);
  });

  it("maps to the shape the learn pages read", () => {
    assert.deepEqual(toUserProgress(progress({ bestExamScore: 75 })), {
      is_unlocked: true,
      is_completed: false,
      best_exam_score: 75,
      unlocked_at: EARLIER,
      completed_at: null,
    });
  });
});

describe("summarizing lesson sessions", () => {
  it("counts runs, keeps the best score and remembers any pass", () => {
    const summaries = summarizeLessonSessions([
      { id: "a", lessonId: "lesson-1", avgScore: 60, passed: false },
      { id: "b", lessonId: "lesson-1", avgScore: 85, passed: true },
      { id: "c", lessonId: "lesson-1", avgScore: 70, passed: false },
      { id: "d", lessonId: "lesson-2", avgScore: null, passed: null },
    ]);

    assert.deepEqual(summaries.get("lesson-1"), {
      session_id: "a",
      attempt_count: 3,
      best_score: 85,
      passed: true,
    });
    assert.deepEqual(summaries.get("lesson-2"), {
      session_id: "d",
      attempt_count: 1,
      best_score: null,
      passed: null,
    });
    assert.equal(summaries.has("lesson-3"), false);
  });
});

describe("learning stats", () => {
  const today = new Date("2026-10-23T15:00:00.000Z");

  it("counts consecutive days ending today", () => {
    const starts = [
      "2026-10-23T08:00:00.000Z",
      "2026-10-23T09:00:00.000Z",
      "2026-10-22T20:00:00.000Z",
      "2026-10-21T07:00:00.000Z",
      "2026-10-19T07:00:00.000Z",
    ];
    assert.equal(currentStreakDays(starts, today), 3);
  });

  it("is zero when nothing happened today", () => {
    assert.equal(currentStreakDays(["2026-10-22T08:00:00.000Z"], today), 0);
    assert.equal(currentStreakDays([], today), 0);
  });

  it("averages to a whole number and is zero with no attempts", () => {
    assert.equal(averageScore(3, 250), 83);
    assert.equal(averageScore(0, 0), 0);
  });
});
