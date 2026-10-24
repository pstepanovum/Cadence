// FILE: tests/web/srs.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQueue, dayKey, isDue, NEW_CARD, review } from "../../src/components/learn-hub/srs.ts";

const day = new Date(2026, 9, 24, 12);

describe("web flashcard scheduling", () => {
  it("schedules a first good review for tomorrow and grows after", () => {
    const first = review(undefined, "good", day);
    assert.equal(first.interval, 1);
    assert.equal(first.due, "2026-10-25");
    const second = review(first, "good", new Date(2026, 9, 25, 12));
    assert.equal(second.interval, 3);
    const third = review(second, "good", new Date(2026, 9, 28, 12));
    assert.equal(third.interval, Math.round(3 * 2.5));
  });

  it("brings a forgotten card back today and lowers its ease", () => {
    const learnt = review(review(undefined, "good", day), "good", day);
    const forgot = review(learnt, "again", day);
    assert.equal(forgot.due, dayKey(day));
    assert.equal(forgot.lapses, 1);
    assert.ok(forgot.ease < learnt.ease);
  });

  it("grows hard cards slower than good and easy faster", () => {
    const base = review(review(undefined, "good", day), "good", day);
    const hard = review(base, "hard", day).interval;
    const good = review(base, "good", day).interval;
    const easy = review(base, "easy", day).interval;
    assert.ok(hard < good && good < easy);
  });

  it("queues due cards first, oldest first, then a few new ones", () => {
    const states = {
      a: { ...NEW_CARD, due: "2026-10-20", reps: 1, interval: 1 },
      b: { ...NEW_CARD, due: "2026-10-22", reps: 1, interval: 1 },
      c: { ...NEW_CARD, due: "2026-11-30", reps: 1, interval: 30 },
    };
    assert.deepEqual(buildQueue(["b", "c", "a", "n1", "n2"], states, day, 1), ["a", "b", "n1"]);
    assert.equal(isDue(states.c, day), false);
  });
});
