// FILE: tests/platform/placement.test.ts
//
// Placement scoring (src/lib/platform/placement.ts): the written staircase,
// the spoken sample moving it by at most one level, and the same answer for
// the same input every time.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { combineLevels, writtenConfidence, writtenEstimate, writtenLevel, writtenScore, type PlacementItem } from "../../src/lib/platform/placement.ts";
import { CEFR_LEVELS } from "../../src/lib/platform/content-model.ts";

// About twenty items climbing A2 to C1, as the full placement test asks.
const ITEMS: PlacementItem[] = (["A2", "B1", "B2", "C1"] as const).flatMap((level) => Array.from({ length: 5 }, (_, i) => ({ id: `place.${level}.${i}`, level })));
const answer = (passed: string[]) => Object.fromEntries(ITEMS.map((item) => [item.id, passed.includes(item.level) ? 1 : 0]));

describe("placement scoring", () => {
  it("climbs to the highest level reached and stops after two misses in a row", () => {
    assert.equal(writtenLevel(ITEMS, answer(["A2", "B1"])), "B1");
    assert.equal(writtenLevel(ITEMS, answer(["A2", "B1", "B2", "C1"])), "C1");
    assert.equal(writtenLevel(ITEMS, answer([])), "A2", "below the first level asked is that level");
    assert.equal(writtenLevel(ITEMS, answer(["A2", "C1"])), "A2", "two misses end the climb");
    assert.equal(writtenLevel(ITEMS, answer(["A2", "B2"])), "B2", "one miss does not");
  });

  it("needs half of a level's questions fully right", () => {
    const scores = answer(["A2"]);
    scores["place.B1.0"] = 1;
    scores["place.B1.1"] = 1;
    scores["place.B1.2"] = 0.9;
    assert.equal(writtenLevel(ITEMS, scores), "A2");
    scores["place.B1.2"] = 1;
    assert.equal(writtenLevel(ITEMS, scores), "B1");
  });

  it("scores 0 to 100 and rates a clean staircase as high confidence", () => {
    assert.equal(writtenScore(ITEMS, answer(["A2", "B1"])), 50);
    assert.equal(writtenScore([], {}), 0);
    assert.equal(writtenConfidence(ITEMS, answer(["A2", "B1"])), "high");
    assert.equal(writtenConfidence(ITEMS, answer(["A2", "B1", "C1"])), "medium");
    assert.equal(writtenConfidence(ITEMS, answer(["B1", "C1"])), "low");
  });

  it("lets the spoken sample move the written level by at most one", () => {
    assert.equal(combineLevels("B1", "C2"), "B2");
    assert.equal(combineLevels("B1", "A1"), "A2");
    assert.equal(combineLevels("B1", "B1"), "B1");
    assert.equal(combineLevels("C2", "C2"), "C2");
    assert.equal(combineLevels("A1", "A1"), "A1");
    assert.equal(combineLevels("B2", null), "B2");
    for (const written of CEFR_LEVELS)
      for (const spoken of CEFR_LEVELS) {
        const moved = Math.abs(CEFR_LEVELS.indexOf(combineLevels(written, spoken)) - CEFR_LEVELS.indexOf(written));
        assert.ok(moved <= 1);
      }
  });

  it("says when only the written part was used, and is deterministic", () => {
    const scores = answer(["A2", "B1", "B2"]);
    const estimate = writtenEstimate(ITEMS, scores);
    assert.deepEqual(estimate, { level: "B2", confidence: "high", strengths: [], focus: [], spokenUsed: false });
    assert.deepEqual(writtenEstimate([...ITEMS].reverse(), scores), estimate);
  });
});
