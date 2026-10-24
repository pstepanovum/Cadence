// Run with: npm test  (node --test, native TypeScript type stripping)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyReview,
  emptyProgress,
  parseProgress,
  playStreak,
  recordResult,
  type GameResult,
} from "../src/games/progress.ts";

const NOW = new Date(2026, 9, 7, 12);

function result(gameId: GameResult["gameId"], score: number): GameResult {
  return { gameId, score, accuracy: 80, correct: 8, total: 10, playedAt: NOW.toISOString() };
}

describe("parseProgress", () => {
  it("collapses garbage to the default", () => {
    assert.deepEqual(parseProgress(null), emptyProgress());
    assert.deepEqual(parseProgress("nope"), emptyProgress());
    assert.deepEqual(parseProgress({ cards: { a: { reps: "x" } }, results: [{}] }), emptyProgress());
  });

  it("keeps well-formed data and drops the rest", () => {
    const parsed = parseProgress({
      cards: { a: { reps: 1, interval: 1, ease: 2.5, due: "2026-10-08", lapses: 0, extra: true } },
      results: [result("spelling", 50)],
      bests: { spelling: 50, bogus: "no" },
      days: ["2026-10-07", 3],
    });
    assert.deepEqual(Object.keys(parsed.cards), ["a"]);
    assert.equal("extra" in parsed.cards.a, false);
    assert.equal(parsed.results.length, 1);
    assert.deepEqual(parsed.bests, { spelling: 50 });
    assert.deepEqual(parsed.days, ["2026-10-07"]);
  });
});

describe("recordResult", () => {
  it("prepends the result, keeps the best score and marks the day once", () => {
    let progress = recordResult(emptyProgress(), result("spelling", 40), NOW);
    progress = recordResult(progress, result("spelling", 90), NOW);
    progress = recordResult(progress, result("spelling", 60), NOW);
    assert.equal(progress.results[0].score, 60);
    assert.equal(progress.bests.spelling, 90);
    assert.deepEqual(progress.days, ["2026-10-07"]);
    assert.equal(progress.results.length, 3);
  });
});

describe("applyReview", () => {
  it("updates one card and leaves the rest alone", () => {
    const progress = applyReview(emptyProgress(), "ev-01", "good", NOW);
    assert.equal(progress.cards["ev-01"].due, "2026-10-08");
    assert.equal(Object.keys(progress.cards).length, 1);
  });
});

describe("playStreak", () => {
  it("counts back from today", () => {
    assert.equal(playStreak(["2026-10-07", "2026-10-06", "2026-10-05", "2026-10-01"], NOW), 3);
  });

  it("survives a day not yet played", () => {
    assert.equal(playStreak(["2026-10-06", "2026-10-05"], NOW), 2);
  });

  it("is zero after a two-day gap", () => {
    assert.equal(playStreak(["2026-10-04", "2026-10-03"], NOW), 0);
    assert.equal(playStreak([], NOW), 0);
  });
});
