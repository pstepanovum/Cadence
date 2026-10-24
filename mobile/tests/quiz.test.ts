// Run with: npm test  (node --test, native TypeScript type stripping)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PairGroup } from "../src/data/minimal-pairs.ts";
import type { VocabWord } from "../src/data/vocabulary.ts";
import {
  EMPTY_TALLY,
  accuracy,
  buildMeaningQuestions,
  buildSoundRounds,
  distractorsFor,
  pointsFor,
  roundVerdict,
  tallyAnswer,
} from "../src/games/quiz.ts";
import { seededRng } from "../src/games/random.ts";

function word(id: string, pos: VocabWord["pos"] = "noun"): VocabWord {
  return { id, word: id, ipa: "", pos, definition: `def ${id}`, example: "", level: "everyday" };
}

const POOL: VocabWord[] = [
  word("a", "noun"),
  word("b", "noun"),
  word("c", "noun"),
  word("d", "verb"),
  word("e", "verb"),
  word("f", "adjective"),
];

describe("scoring", () => {
  it("rewards a combo but caps the bonus", () => {
    assert.equal(pointsFor(0), 10);
    assert.equal(pointsFor(3), 16);
    assert.equal(pointsFor(5), 20);
    assert.equal(pointsFor(50), 20);
  });

  it("tallies a round", () => {
    let tally = tallyAnswer(EMPTY_TALLY, true);
    tally = tallyAnswer(tally, true);
    tally = tallyAnswer(tally, false);
    tally = tallyAnswer(tally, true);
    assert.deepEqual(tally, { correct: 3, answered: 4, score: 10 + 12 + 10, streak: 1, bestStreak: 2 });
  });

  it("computes accuracy safely", () => {
    assert.equal(accuracy(3, 4), 75);
    assert.equal(accuracy(0, 0), 0);
  });

  it("phrases the verdict", () => {
    assert.equal(roundVerdict(100).passed, true);
    assert.equal(roundVerdict(70).passed, true);
    assert.equal(roundVerdict(69).passed, false);
  });
});

describe("buildMeaningQuestions", () => {
  it("builds the requested number with four distinct options including the answer", () => {
    const questions = buildMeaningQuestions(POOL, 5, seededRng(3));
    assert.equal(questions.length, 5);
    for (const question of questions) {
      assert.equal(question.options.length, 4);
      assert.ok(question.options.includes(question.answer));
      assert.equal(new Set(question.options.map((option) => option.id)).size, 4);
    }
  });

  it("alternates direction so both sides of the card get practised", () => {
    const questions = buildMeaningQuestions(POOL, 4, seededRng(3));
    assert.deepEqual(
      questions.map((question) => question.direction),
      ["pick-word", "pick-definition", "pick-word", "pick-definition"],
    );
  });

  it("never repeats an answer within a round", () => {
    const questions = buildMeaningQuestions(POOL, 6, seededRng(9));
    assert.equal(new Set(questions.map((question) => question.answer.id)).size, 6);
  });

  it("prefers distractors with the same part of speech", () => {
    const chosen = distractorsFor(POOL[0], POOL, 2, seededRng(1));
    assert.deepEqual(chosen.map((item) => item.pos), ["noun", "noun"]);
  });

  it("is deterministic for a seed and empty for a tiny pool", () => {
    const a = buildMeaningQuestions(POOL, 3, seededRng(5)).map((question) => question.answer.id);
    const b = buildMeaningQuestions(POOL, 3, seededRng(5)).map((question) => question.answer.id);
    assert.deepEqual(a, b);
    assert.deepEqual(buildMeaningQuestions([POOL[0]], 3, seededRng(5)), []);
  });
});

describe("buildSoundRounds", () => {
  const groups: PairGroup[] = [
    { key: "r-l", label: "R vs L", blurb: "", pairs: [["right", "light"], ["red", "led"]] },
    { key: "v-w", label: "V vs W", blurb: "", pairs: [["vine", "wine"]] },
  ];

  it("plays one word of each chosen pair", () => {
    const rounds = buildSoundRounds(groups, 3, seededRng(11));
    assert.equal(rounds.length, 3);
    for (const round of rounds) {
      assert.ok(round.pair.includes(round.target));
    }
    assert.equal(new Set(rounds.map((round) => round.pair.join("/"))).size, 3);
  });

  it("does not ask for more than exists", () => {
    assert.equal(buildSoundRounds(groups, 10, seededRng(1)).length, 3);
    assert.deepEqual(buildSoundRounds([], 10, seededRng(1)), []);
  });
});
