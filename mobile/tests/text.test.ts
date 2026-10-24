// Run with: npm test  (node --test, native TypeScript type stripping)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seededRng } from "../src/games/random.ts";
import {
  checkSpelling,
  hintMask,
  isScrambleable,
  letterCount,
  letterDiff,
  levenshtein,
  normalizeAnswer,
  scrambleWord,
} from "../src/games/text.ts";

describe("normalizeAnswer", () => {
  it("ignores case, padding and stray punctuation", () => {
    assert.equal(normalizeAnswer("  Errand! "), "errand");
    assert.equal(normalizeAnswer("catch   up"), "catch up");
    assert.equal(normalizeAnswer("trade-off"), "trade-off");
    assert.equal(normalizeAnswer("she’s"), "she's");
  });
});

describe("levenshtein", () => {
  it("counts edits", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
    assert.equal(levenshtein("", "abc"), 3);
    assert.equal(levenshtein("same", "same"), 0);
  });
});

describe("checkSpelling", () => {
  it("accepts an exact match regardless of case", () => {
    assert.equal(checkSpelling("Deadline", "deadline").correct, true);
  });

  it("flags a one-letter slip as close on longer words only", () => {
    assert.deepEqual(checkSpelling("recieve", "receive"), { correct: false, distance: 2, close: false });
    assert.deepEqual(checkSpelling("errend", "errand"), { correct: false, distance: 1, close: true });
    assert.equal(checkSpelling("nab", "nap").close, false);
  });

  it("never calls an empty answer correct", () => {
    assert.equal(checkSpelling("   ", "").correct, false);
  });
});

describe("letterDiff", () => {
  it("marks each target letter", () => {
    assert.deepEqual(
      letterDiff("errend", "errand").map((item) => item.status),
      ["match", "match", "match", "wrong", "match", "match"],
    );
    assert.deepEqual(
      letterDiff("nap", "napkin").map((item) => item.status),
      ["match", "match", "match", "missing", "missing", "missing"],
    );
  });
});

describe("hintMask", () => {
  it("reveals letters from the left and keeps the shape of a phrase", () => {
    assert.equal(hintMask("errand", 0), "_ _ _ _ _ _");
    assert.equal(hintMask("errand", 2), "e r _ _ _ _");
    assert.equal(hintMask("catch up", 1), "c _ _ _ _   _ _");
    assert.equal(hintMask("trade-off", 5), "t r a d e - _ _ _");
  });

  it("counts only letters", () => {
    assert.equal(letterCount("catch up"), 7);
    assert.equal(letterCount("trade-off"), 8);
  });
});

describe("scrambleWord", () => {
  it("keeps every letter and never returns the word itself", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 50; i++) {
      const tiles = scrambleWord("errand", rng);
      assert.equal(tiles.map((tile) => tile.letter).sort().join(""), "adenrr");
      assert.notEqual(tiles.map((tile) => tile.letter).join(""), "errand");
    }
  });

  it("is deterministic for a given seed", () => {
    const a = scrambleWord("deadline", seededRng(7)).map((tile) => tile.letter).join("");
    const b = scrambleWord("deadline", seededRng(7)).map((tile) => tile.letter).join("");
    assert.equal(a, b);
  });

  it("handles a word whose letters are all the same by reversing nothing harmful", () => {
    const tiles = scrambleWord("aaaa", seededRng(1));
    assert.equal(tiles.map((tile) => tile.letter).join(""), "aaaa");
  });

  it("only offers plain words of a playable length", () => {
    assert.equal(isScrambleable("errand"), true);
    assert.equal(isScrambleable("nap"), false);
    assert.equal(isScrambleable("catch up"), false);
    assert.equal(isScrambleable("trade-off"), false);
  });
});
