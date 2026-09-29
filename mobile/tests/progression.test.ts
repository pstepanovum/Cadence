import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  didPass,
  EXAM_PASS,
  isLessonUnlocked,
  lessonAfter,
  lockReason,
  moduleCompletion,
  nextLesson,
  nextScenario,
  passMark,
  PRACTICE_PASS,
  scenarioLockReason,
  scenarioPassed,
  type LessonLike,
} from "../src/practice/progression.ts";

function lesson(
  id: string,
  lesson_type: LessonLike["lesson_type"],
  sort_order: number,
  summary?: { passed: boolean | null; best_score: number | null } | null,
): LessonLike {
  return { id, lesson_type, sort_order, session_summary: summary ?? null };
}

describe("passMark / didPass", () => {
  it("uses 80 for practice and 70 for the exam", () => {
    assert.equal(passMark("practice"), PRACTICE_PASS);
    assert.equal(passMark("practice"), 80);
    assert.equal(passMark("exam"), EXAM_PASS);
    assert.equal(passMark("exam"), 70);
  });

  it("passes on the boundary, not below it", () => {
    assert.equal(didPass("practice", [80, 80]), true);
    assert.equal(didPass("practice", [80, 79]), true, "79.5 rounds up to the 80 mark");
    assert.equal(didPass("practice", [80, 78]), false, "79 is a fail");
    assert.equal(didPass("exam", [70]), true);
    assert.equal(didPass("exam", [69]), false);
  });

  it("treats an empty run as a fail, but theory as always cleared", () => {
    assert.equal(didPass("practice", []), false);
    assert.equal(didPass("exam", []), false);
    assert.equal(didPass("theory", []), true);
  });
});

describe("isLessonUnlocked", () => {
  const lessons = [
    lesson("t1", "theory", 1),
    lesson("p1", "practice", 2),
    lesson("e1", "exam", 3),
  ];

  it("leaves theory and practice open", () => {
    assert.equal(isLessonUnlocked(lessons, "t1"), true);
    assert.equal(isLessonUnlocked(lessons, "p1"), true);
  });

  it("locks the exam until everything before it is cleared", () => {
    assert.equal(isLessonUnlocked(lessons, "e1"), false);
  });

  it("opens the exam once theory is read and practice is passed", () => {
    const cleared = [
      lesson("t1", "theory", 1, { passed: null, best_score: null }),
      lesson("p1", "practice", 2, { passed: true, best_score: 84 }),
      lesson("e1", "exam", 3),
    ];
    assert.equal(isLessonUnlocked(cleared, "e1"), true);
  });

  it("accepts a high best_score even when the server never set passed", () => {
    const cleared = [
      lesson("t1", "theory", 1, { passed: null, best_score: null }),
      lesson("p1", "practice", 2, { passed: null, best_score: 91 }),
      lesson("e1", "exam", 3),
    ];
    assert.equal(isLessonUnlocked(cleared, "e1"), true);
  });

  it("keeps the exam locked when practice was attempted but not passed", () => {
    const attempted = [
      lesson("t1", "theory", 1, { passed: null, best_score: null }),
      lesson("p1", "practice", 2, { passed: false, best_score: 62 }),
      lesson("e1", "exam", 3),
    ];
    assert.equal(isLessonUnlocked(attempted, "e1"), false);
  });

  it("ignores array order and uses sort_order", () => {
    const shuffled = [lesson("e1", "exam", 3), lesson("p1", "practice", 2), lesson("t1", "theory", 1)];
    assert.equal(isLessonUnlocked(shuffled, "e1"), false);
    assert.equal(isLessonUnlocked(shuffled, "t1"), true);
  });

  it("returns false for a lesson that is not in the module", () => {
    assert.equal(isLessonUnlocked(lessons, "nope"), false);
  });
});

describe("lockReason", () => {
  it("is null for an open lesson", () => {
    assert.equal(lockReason([lesson("p1", "practice", 1)], "p1"), null);
  });

  it("counts what is left, in the singular and the plural", () => {
    const one = [
      lesson("t1", "theory", 1, { passed: null, best_score: null }),
      lesson("p1", "practice", 2),
      lesson("e1", "exam", 3),
    ];
    assert.equal(lockReason(one, "e1"), "Finish the lesson above to unlock the exam.");

    const two = [lesson("t1", "theory", 1), lesson("p1", "practice", 2), lesson("e1", "exam", 3)];
    assert.equal(lockReason(two, "e1"), "Finish the 2 lessons above to unlock the exam.");
  });
});

describe("nextLesson / lessonAfter", () => {
  const lessons = [
    lesson("t1", "theory", 1, { passed: null, best_score: null }),
    lesson("p1", "practice", 2),
    lesson("e1", "exam", 3),
  ];

  it("points at the first lesson that is not cleared", () => {
    assert.equal(nextLesson(lessons)?.id, "p1");
  });

  it("is null when the module is finished", () => {
    const done = [
      lesson("t1", "theory", 1, { passed: null, best_score: null }),
      lesson("p1", "practice", 2, { passed: true, best_score: 88 }),
      lesson("e1", "exam", 3, { passed: true, best_score: 77 }),
    ];
    assert.equal(nextLesson(done), null);
  });

  it("walks the curriculum in sort order", () => {
    assert.equal(lessonAfter(lessons, "t1")?.id, "p1");
    assert.equal(lessonAfter(lessons, "e1"), null);
    assert.equal(lessonAfter(lessons, "missing"), null);
  });
});

describe("moduleCompletion", () => {
  it("is 0 for an empty module and never divides by zero", () => {
    assert.equal(moduleCompletion([]), 0);
  });

  it("counts cleared lessons", () => {
    const lessons = [
      lesson("t1", "theory", 1, { passed: null, best_score: null }),
      lesson("p1", "practice", 2, { passed: true, best_score: 90 }),
      lesson("p2", "practice", 3),
      lesson("e1", "exam", 4),
    ];
    assert.equal(moduleCompletion(lessons), 50);
  });
});

describe("conversation scenarios", () => {
  const scenarios = [
    { slug: "coffee", title: "Coffee chat", sortOrder: 1, passScore: 84, isUnlocked: true, isCompleted: true },
    { slug: "hotel", title: "Hotel change request", sortOrder: 2, passScore: 85, isUnlocked: true, isCompleted: false },
    { slug: "interview", title: "Interview follow-up", sortOrder: 3, passScore: 86, isUnlocked: false, isCompleted: false },
  ];

  it("uses each scenario's own pass score, not a global one", () => {
    assert.equal(scenarioPassed(84, [84, 84]), true);
    assert.equal(scenarioPassed(90, [84, 84]), false);
    assert.equal(scenarioPassed(84, []), false);
  });

  it("suggests the first unlocked scenario that is not yet passed", () => {
    assert.equal(nextScenario(scenarios)?.slug, "hotel");
    assert.equal(nextScenario([]), null);
    assert.equal(
      nextScenario(scenarios.map((s) => ({ ...s, isCompleted: true }))),
      null,
    );
  });

  it("explains a lock by naming the scenario that gates it", () => {
    assert.equal(
      scenarioLockReason(scenarios, "interview"),
      'Pass "Hotel change request" with 85 or higher to unlock this scenario.',
    );
    assert.equal(scenarioLockReason(scenarios, "hotel"), null);
    assert.equal(scenarioLockReason(scenarios, "nope"), null);
  });
});
