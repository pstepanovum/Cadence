// FILE: tests/platform/srs.test.ts
//
// The shared SM-2 scheduler (src/lib/platform/srs.ts). Run with: pnpm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NEW_CARD,
  dayKey,
  isDue,
  isNew,
  mastery,
  planSession,
  review,
  summarizeDeck,
  type CardState,
} from "../../src/lib/platform/srs.ts";

const NOW = new Date(2026, 9, 7, 12, 0, 0); // 7 Oct 2026, local

describe("review", () => {
  it("schedules a brand-new card for tomorrow on good", () => {
    const card = review(undefined, "good", NOW);
    assert.equal(card.reps, 1);
    assert.equal(card.interval, 1);
    assert.equal(card.due, "2026-10-08");
  });

  it("grows the interval with the ease factor", () => {
    let card = review(undefined, "good", NOW);
    card = review(card, "good", NOW);
    assert.equal(card.interval, 3);
    card = review(card, "good", NOW);
    assert.equal(card.interval, Math.round(3 * 2.5));
  });

  it("easy jumps further and raises the ease", () => {
    const card = review(undefined, "easy", NOW);
    assert.equal(card.interval, 3);
    assert.ok(card.ease > NEW_CARD.ease);
  });

  it("again resets to today, lowers the ease and counts a lapse once learned", () => {
    const learned = review(review(undefined, "good", NOW), "good", NOW);
    const forgotten = review(learned, "again", NOW);
    assert.equal(forgotten.reps, 0);
    assert.equal(forgotten.interval, 0);
    assert.equal(forgotten.due, dayKey(NOW));
    assert.equal(forgotten.lapses, 1);
    assert.ok(forgotten.ease < learned.ease);
  });

  it("again on a never-seen card is not a lapse", () => {
    assert.equal(review(undefined, "again", NOW).lapses, 0);
  });

  it("never lets the ease drop below the floor", () => {
    let card: CardState = { ...NEW_CARD, ease: 1.35, due: "2026-10-01" };
    card = review(card, "again", NOW);
    assert.equal(card.ease, 1.3);
    card = review(card, "again", NOW);
    assert.equal(card.ease, 1.3);
  });
});

describe("due and mastery", () => {
  it("treats an unreviewed card as new, not due", () => {
    assert.equal(isNew(undefined), true);
    assert.equal(isDue(undefined, NOW), false);
    assert.equal(mastery(undefined), "new");
  });

  it("is due on the day itself and after", () => {
    const card = review(undefined, "good", NOW);
    assert.equal(isDue(card, NOW), false);
    assert.equal(isDue(card, new Date(2026, 9, 8)), true);
    assert.equal(isDue(card, new Date(2026, 9, 20)), true);
  });

  it("maps intervals onto mastery bands", () => {
    assert.equal(mastery({ ...NEW_CARD, due: "2026-10-08", interval: 1 }), "learning");
    assert.equal(mastery({ ...NEW_CARD, due: "2026-10-08", interval: 7 }), "known");
    assert.equal(mastery({ ...NEW_CARD, due: "2026-10-08", interval: 30 }), "mastered");
  });
});

describe("planSession", () => {
  const ids = ["a", "b", "c", "d", "e"];

  it("puts due cards first, oldest due first, then new cards in deck order", () => {
    const cards: Record<string, CardState> = {
      a: { ...NEW_CARD, due: "2026-10-07", interval: 1 },
      c: { ...NEW_CARD, due: "2026-10-01", interval: 1 },
      d: { ...NEW_CARD, due: "2026-12-01", interval: 30 },
    };
    const plan = planSession(ids, cards, NOW);
    assert.deepEqual(plan.ids, ["c", "a", "b", "e"]);
    assert.equal(plan.dueCount, 2);
    assert.equal(plan.newCount, 2);
  });

  it("caps new cards", () => {
    const plan = planSession(ids, {}, NOW, { newLimit: 2 });
    assert.deepEqual(plan.ids, ["a", "b"]);
  });

  it("is empty when nothing is due and nothing is new", () => {
    const cards = Object.fromEntries(ids.map((id) => [id, { ...NEW_CARD, due: "2099-01-01", interval: 5 }]));
    assert.deepEqual(planSession(ids, cards, NOW).ids, []);
  });
});

describe("summarizeDeck", () => {
  it("counts each band and what is due", () => {
    const cards: Record<string, CardState> = {
      a: { ...NEW_CARD, due: "2026-10-01", interval: 1 },
      b: { ...NEW_CARD, due: "2026-11-01", interval: 10 },
      c: { ...NEW_CARD, due: "2026-11-01", interval: 40 },
    };
    const summary = summarizeDeck(["a", "b", "c", "d"], cards, NOW);
    assert.deepEqual(summary, { total: 4, new: 1, learning: 1, known: 1, mastered: 1, dueToday: 1 });
  });
});
