// FILE: tests/cloud/attempt-input.test.ts
//
// What a client may store: bounded strings, a percentage score, and phoneme
// detail only when it is a small plain object.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ATTEMPT_TEXT_MAX_LENGTH,
  clampScore,
  parseAttemptInput,
} from "../../src/lib/cloud/attempt-input.ts";

const valid = {
  lesson_id: "lesson-1",
  lesson_word_id: "word-1",
  word: "think",
  score: 82.4,
  ipa_target: "θɪŋk",
  ipa_transcript: "tɪŋk",
  phoneme_detail: { phonemes: [{ symbol: "θ", score: 40 }] },
  attempt_number: 2,
};

describe("clampScore", () => {
  it("keeps scores within 0 to 100", () => {
    assert.equal(clampScore(1e9), 100);
    assert.equal(clampScore(-5), 0);
    assert.equal(clampScore(69.6), 69.6);
  });
});

describe("parseAttemptInput", () => {
  it("accepts a normal attempt", () => {
    const result = parseAttemptInput(valid);
    assert.ok(result.ok);
    assert.equal(result.value.score, 82.4);
    assert.equal(result.value.attemptNumber, 2);
    assert.deepEqual(result.value.phonemeDetail, valid.phoneme_detail);
  });

  it("refuses missing or oversized identifiers", () => {
    assert.equal(parseAttemptInput({ ...valid, lesson_id: undefined }).ok, false);
    assert.equal(parseAttemptInput({ ...valid, word: "x".repeat(ATTEMPT_TEXT_MAX_LENGTH + 1) }).ok, false);
    assert.equal(parseAttemptInput({ ...valid, score: Number.NaN }).ok, false);
    assert.equal(parseAttemptInput(null).ok, false);
  });

  it("drops phoneme detail that is not a small plain object", () => {
    for (const phoneme_detail of [[1, 2], "text", { blob: "x".repeat(40_000) }]) {
      const result = parseAttemptInput({ ...valid, phoneme_detail });
      assert.ok(result.ok);
      assert.equal(result.value.phonemeDetail, null);
    }
  });

  it("drops oversized optional strings and bounds the attempt number", () => {
    const result = parseAttemptInput({
      ...valid,
      ipa_transcript: "x".repeat(ATTEMPT_TEXT_MAX_LENGTH + 1),
      attempt_number: -3,
    });
    assert.ok(result.ok);
    assert.equal(result.value.ipaTranscript, null);
    assert.equal(result.value.attemptNumber, 1);
  });
});
