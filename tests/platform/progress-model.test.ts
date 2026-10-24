// FILE: tests/platform/progress-model.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RECENT_RESULTS_CAP,
  applyActivity,
  currentStreak,
  emptySummary,
  isDayKey,
  shiftDay,
  type Activity,
} from "../../src/lib/platform/progress-model.ts";

const activity = (day: string, over: Partial<Activity> = {}): Activity => ({
  kind: "quiz",
  refId: "lesson.b1.experiences",
  level: "B1",
  score: 80,
  minutes: 5,
  day,
  at: Date.parse(`${day}T12:00:00Z`),
  ...over,
});

describe("days", () => {
  it("validates and shifts calendar days across month ends", () => {
    assert.equal(isDayKey("2026-02-29"), false);
    assert.equal(isDayKey("2028-02-29"), true);
    assert.equal(shiftDay("2026-10-31", 1), "2026-11-01");
    assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  });
});

describe("summary", () => {
  it("counts a streak of consecutive days and resets after a gap", () => {
    let s = emptySummary();
    s = applyActivity(s, activity("2026-10-20"));
    s = applyActivity(s, activity("2026-10-21"));
    s = applyActivity(s, activity("2026-10-21"));
    assert.equal(s.streak.current, 2);
    s = applyActivity(s, activity("2026-10-24"));
    assert.equal(s.streak.current, 1);
    assert.equal(s.streak.best, 2);
  });

  it("shows a streak until the day after the last activity", () => {
    const s = applyActivity(emptySummary(), activity("2026-10-20"));
    assert.equal(currentStreak(s, "2026-10-21"), 1);
    assert.equal(currentStreak(s, "2026-10-22"), 0);
  });

  it("does not let a late sync move the streak backwards", () => {
    let s = applyActivity(emptySummary(), activity("2026-10-21"));
    s = applyActivity(s, activity("2026-10-19"));
    assert.equal(s.streak.lastDay, "2026-10-21");
    assert.equal(s.totalMinutes, 10);
  });

  it("counts finished lessons per level and keeps only the newest results", () => {
    let s = emptySummary();
    for (let i = 0; i < RECENT_RESULTS_CAP + 5; i += 1) {
      s = applyActivity(s, activity("2026-10-21", { at: 1_000 + i, completedLesson: i === 0 }));
    }
    assert.equal(s.lessonsCompleted.B1, 1);
    assert.equal(s.recent.length, RECENT_RESULTS_CAP);
    assert.equal(s.recent[0].at, 1_000 + RECENT_RESULTS_CAP + 4);
  });

  it("clamps scores and never mutates its input", () => {
    const before = emptySummary();
    const after = applyActivity(before, activity("2026-10-21", { score: 140 }));
    assert.equal(after.recent[0].score, 100);
    assert.deepEqual(before, emptySummary());
  });

  it("refuses a malformed day", () => {
    assert.throws(() => applyActivity(emptySummary(), activity("21/10/2026")));
  });
});
