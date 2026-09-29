// Run with: npm test  (node --test, native TypeScript type stripping)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  averageScore,
  bestScore,
  isEncouraging,
  normalizeScore,
  phonemeCaption,
  queueProgress,
  scoreLabel,
  scoreStatus,
  weakestPhonemes,
} from "../src/practice/scoring.ts";

describe("normalizeScore", () => {
  it("rounds to a whole number", () => {
    assert.equal(normalizeScore(72.4), 72);
    assert.equal(normalizeScore(72.6), 73);
  });

  it("clamps out-of-range engine output", () => {
    assert.equal(normalizeScore(-10), 0);
    assert.equal(normalizeScore(140), 100);
  });

  it("treats non-finite input as zero rather than rendering NaN", () => {
    assert.equal(normalizeScore(Number.NaN), 0);
    assert.equal(normalizeScore(Number.POSITIVE_INFINITY), 100);
  });
});

describe("scoreStatus", () => {
  it("uses the web app's 70 / 50 thresholds, inclusive", () => {
    assert.equal(scoreStatus(100), "correct");
    assert.equal(scoreStatus(70), "correct");
    assert.equal(scoreStatus(69.5), "correct", "69.5 rounds to 70");
    assert.equal(scoreStatus(69), "mixed");
    assert.equal(scoreStatus(50), "mixed");
    assert.equal(scoreStatus(49), "needs-work");
    assert.equal(scoreStatus(0), "needs-work");
  });
});

describe("scoreLabel", () => {
  it("gives one headline per band", () => {
    assert.equal(scoreLabel(90), "Sounds great");
    assert.equal(scoreLabel(60), "Close — tighten it up");
    assert.equal(scoreLabel(20), "Needs work");
  });
});

describe("isEncouraging", () => {
  it("matches the web cue threshold: strictly above 50", () => {
    assert.equal(isEncouraging(51), true);
    assert.equal(isEncouraging(50), false);
    assert.equal(isEncouraging(0), false);
  });
});

describe("averageScore / bestScore", () => {
  it("returns 0 for an empty run instead of NaN", () => {
    assert.equal(averageScore([]), 0);
    assert.equal(bestScore([]), 0);
  });

  it("rounds the mean the same way the server stores it", () => {
    assert.equal(averageScore([80, 81]), 81);
    assert.equal(averageScore([70, 71, 72]), 71);
  });

  it("normalises each entry before averaging", () => {
    assert.equal(averageScore([120, 80]), 90);
    assert.equal(bestScore([120, 80]), 100);
  });
});

describe("queueProgress", () => {
  it("is 0 before the first item and 100 only when the last is scored", () => {
    assert.equal(queueProgress(0, 5), 0);
    assert.equal(queueProgress(1, 5), 20);
    assert.equal(queueProgress(5, 5), 100);
  });

  it("never divides by zero or overflows", () => {
    assert.equal(queueProgress(3, 0), 0);
    assert.equal(queueProgress(9, 5), 100);
    assert.equal(queueProgress(-1, 5), 0);
  });
});

describe("phonemeCaption", () => {
  it("names what was heard when the phoneme missed", () => {
    assert.equal(
      phonemeCaption({ symbol: "θ", heard: "s", accuracy: 12, status: "needs-work" }),
      "heard s",
    );
  });

  it("falls back to accuracy when the engine sends no substitution", () => {
    assert.equal(
      phonemeCaption({ symbol: "θ", heard: "   ", accuracy: 12.4, status: "needs-work" }),
      "12%",
    );
  });

  it("shows accuracy for phonemes that did not miss", () => {
    assert.equal(
      phonemeCaption({ symbol: "iː", heard: "iː", accuracy: 97.5, status: "correct" }),
      "98%",
    );
  });
});

describe("weakestPhonemes", () => {
  const phonemes = [
    { symbol: "θ", heard: "s", accuracy: 10, status: "needs-work" as const },
    { symbol: "iː", heard: "iː", accuracy: 99, status: "correct" as const },
    { symbol: "ɹ", heard: "w", accuracy: 40, status: "needs-work" as const },
    { symbol: "æ", heard: "e", accuracy: 65, status: "mixed" as const },
    { symbol: "ŋ", heard: "n", accuracy: 55, status: "mixed" as const },
  ];

  it("drops the correct ones and sorts worst first", () => {
    assert.deepEqual(
      weakestPhonemes(phonemes).map((p) => p.symbol),
      ["θ", "ɹ", "ŋ"],
    );
  });

  it("respects the limit", () => {
    assert.equal(weakestPhonemes(phonemes, 2).length, 2);
    assert.equal(weakestPhonemes(phonemes, 10).length, 4);
  });

  it("does not mutate the input", () => {
    const input = phonemes.slice();
    weakestPhonemes(input);
    assert.equal(input[0].symbol, "θ");
    assert.equal(input.length, 5);
  });

  it("returns nothing when everything was correct", () => {
    assert.deepEqual(weakestPhonemes(phonemes.filter((p) => p.status === "correct")), []);
  });
});
