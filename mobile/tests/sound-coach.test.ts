import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PAIRS_WITH_SOUNDS } from "../src/data/pair-sounds.ts";
import { PRACTICE_TARGETS } from "../src/data/practice-targets.ts";
import {
  DRILL_STEPS,
  REVIEW_DAYS,
  currentStep,
  drillItems,
  emptyMastery,
  mergeMastery,
  recordDrillTake,
  recordPhonemes,
  recordReview,
  recordScore,
  soundsToFix,
  type SoundMastery,
} from "../src/practice/sound-coach.ts";
import { compareTargets, describeTarget, frequencyWeight, soundIdForSymbol } from "../src/practice/sounds.ts";
import { soundById, type ArticulationTarget } from "../src/platform/vocal-tract/articulation.ts";
import { NEUTRAL_PARAMS } from "../src/platform/vocal-tract/maeda.ts";

const T0 = Date.UTC(2026, 9, 1);

describe("scorer symbols", () => {
  it("maps espeak IPA to sound ids", () => {
    assert.equal(soundIdForSymbol("/θ/"), "sound.th");
    assert.equal(soundIdForSymbol("iː"), "sound.iy");
    assert.equal(soundIdForSymbol("/ɹ/"), "sound.r");
    assert.equal(soundIdForSymbol("/oʊ/"), "sound.ow");
    assert.equal(soundIdForSymbol("/tʃ/"), "sound.ch");
    assert.equal(soundIdForSymbol("/ɡ/"), "sound.g");
    assert.equal(soundIdForSymbol("ˈæ"), "sound.ae");
    assert.equal(soundIdForSymbol("/-/"), null);
    assert.equal(soundIdForSymbol(""), null);
  });

  it("weights common sounds above rare ones, and prefers real counts", () => {
    assert.ok(frequencyWeight("sound.ax") > frequencyWeight("sound.zh"));
    assert.equal(frequencyWeight("sound.zh", { "sound.zh": 9 }), 9);
  });
});

describe("mastery", () => {
  it("smooths scores and keeps one history point per day", () => {
    let m = recordScore(undefined, 40, T0, "2026-10-01");
    assert.equal(m.ema, 40);
    m = recordScore(m, 100, T0 + 1, "2026-10-01");
    assert.equal(m.ema, 58);
    assert.equal(m.history.length, 1);
    assert.equal(m.history[0].score, 70);
    assert.equal(m.best, 100);
    m = recordScore(m, 80, T0 + 2, "2026-10-02");
    assert.equal(m.history.length, 2);
  });

  it("drops history older than 30 days", () => {
    let m = recordScore(undefined, 50, T0, "2026-08-01");
    m = recordScore(m, 50, T0, "2026-10-01");
    assert.deepEqual(m.history.map((h) => h.day), ["2026-10-01"]);
  });

  it("folds phonemes of one take into averaged scores per sound", () => {
    const map = recordPhonemes(
      {},
      [
        { symbol: "/θ/", accuracy: 48 },
        { symbol: "/θ/", accuracy: 96 },
        { symbol: "/ɪ/", accuracy: 96 },
        { symbol: "/?/", accuracy: 10 },
      ],
      T0,
      "2026-10-01",
    );
    assert.equal(map["sound.th"].ema, 72);
    assert.equal(map["sound.th"].attempts, 1);
    assert.equal(map["sound.ih"].ema, 96);
    assert.equal(Object.keys(map).length, 2);
  });
});

describe("sounds to fix", () => {
  const weak = (ema: number): SoundMastery => ({ ...emptyMastery(), attempts: 3, ema });

  it("orders by error rate times frequency and leaves strong sounds out", () => {
    const list = soundsToFix({ "sound.zh": weak(40), "sound.t": weak(60), "sound.s": weak(95) }, "2026-10-01");
    // t: 0.4 * 3 = 1.2; zh: 0.6 * 1 = 0.6
    assert.deepEqual(list.map((s) => s.soundId), ["sound.t", "sound.zh"]);
  });

  it("adds fixed sounds whose review is due, after the weak ones", () => {
    const fixed = { ...weak(90), fixedAt: T0, reviewDue: "2026-10-01" };
    const notDue = { ...weak(90), fixedAt: T0, reviewDue: "2026-10-09" };
    const list = soundsToFix({ "sound.r": fixed, "sound.l": notDue, "sound.t": weak(50) }, "2026-10-01");
    assert.deepEqual(list.map((s) => [s.soundId, s.reason]), [["sound.t", "weak"], ["sound.r", "review"]]);
  });
});

describe("drill ladder", () => {
  it("passes a step at three takes in a row at 80 or more", () => {
    let m: SoundMastery | undefined;
    let outcome = recordDrillTake(m, 85, T0, "2026-10-01");
    outcome = recordDrillTake(outcome.mastery, 79, T0, "2026-10-01");
    assert.equal(outcome.mastery.streak, 0);
    for (let i = 0; i < 3; i += 1) outcome = recordDrillTake(outcome.mastery, 90, T0, "2026-10-01");
    assert.equal(outcome.stepPassed, true);
    assert.equal(currentStep(outcome.mastery), "syllable");
    m = outcome.mastery;
    assert.equal(m.streak, 0);
  });

  it("fixes the sound after the last step and schedules reviews at 1, 3, 7 and 21 days", () => {
    let m: SoundMastery = emptyMastery();
    let fixed = false;
    for (let i = 0; i < DRILL_STEPS.length * 3; i += 1) {
      const outcome = recordDrillTake(m, 95, T0, "2026-10-01");
      m = outcome.mastery;
      fixed = fixed || outcome.fixed;
    }
    assert.equal(fixed, true);
    assert.equal(m.fixedAt, T0);
    assert.equal(m.reviewDue, "2026-10-02");
    const due: string[] = [m.reviewDue!];
    let day = m.reviewDue!;
    for (let i = 0; i < REVIEW_DAYS.length; i += 1) {
      m = recordReview(m, 90, T0, day);
      if (m.reviewDue) {
        due.push(m.reviewDue);
        day = m.reviewDue;
      }
    }
    assert.deepEqual(due, ["2026-10-02", "2026-10-05", "2026-10-12", "2026-11-02"]);
    assert.equal(m.reviewDue, null);
  });

  it("a failed review sends the sound back to the word step", () => {
    const fixed: SoundMastery = { ...emptyMastery(), attempts: 9, ema: 90, step: 5, fixedAt: T0, reviewDue: "2026-10-02" };
    const m = recordReview(fixed, 40, T0, "2026-10-02");
    assert.equal(m.fixedAt, null);
    assert.equal(currentStep(m), "word");
  });

  it("merges by the latest take", () => {
    const a = { ...emptyMastery(), lastAt: 5, ema: 10 };
    const b = { ...emptyMastery(), lastAt: 9, ema: 90 };
    assert.equal(mergeMastery({ "sound.t": a }, { "sound.t": b })["sound.t"].ema, 90);
    assert.equal(mergeMastery({ "sound.t": b }, { "sound.t": a })["sound.t"].ema, 90);
  });

  it("finds items for every step from the built-in data", () => {
    const sources = { words: PRACTICE_TARGETS, pairs: PAIRS_WITH_SOUNDS, sentences: ["I think it is thin.", "Nothing here."] };
    assert.deepEqual(drillItems("sound.th", "think", "sound", sources), ["think"]);
    assert.deepEqual(drillItems("sound.th", "think", "syllable", sources).slice(0, 2), ["tha", "thee"]);
    assert.ok(drillItems("sound.th", "think", "word", sources).length > 0);
    assert.ok(drillItems("sound.th", "think", "pair", sources)[0].includes("/"));
    assert.ok(drillItems("sound.th", "think", "phrase", sources)[0].includes(" and "));
    assert.ok(drillItems("sound.iy", "sheep", "syllable", sources).includes("bee"));
  });
});

describe("descriptions", () => {
  const target = (patch: Partial<ArticulationTarget>): ArticulationTarget => ({
    soundId: "sound.t",
    variant: "both",
    params: NEUTRAL_PARAMS,
    voicing: "voiceless",
    airflow: "central",
    highlight: ["tongueTip"],
    overlays: [],
    source: { method: "hand-tuned", references: [] },
    needsReview: true,
    ...patch,
  });

  it("describes consonants and vowels in one line", () => {
    assert.equal(
      describeTarget(target({ place: "alveolar", manner: "plosive" }), soundById("sound.t")!),
      "A voiceless stop made with the tongue tip and gum ridge.",
    );
    const vowel = describeTarget(
      target({ soundId: "sound.uw", voicing: "voiced", vowel: { height: "close", backness: "back", rounding: "rounded" } }),
      soundById("sound.uw")!,
    );
    assert.equal(vowel, "A close back vowel, with rounded lips.");
  });

  it("says what differs between two sounds", () => {
    const th = target({ soundId: "sound.th", place: "dental", manner: "fricative" });
    const s = target({ soundId: "sound.s", place: "alveolar", manner: "fricative" });
    const lines = compareTargets(th, s, ["think", "sink"]);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /think uses the tongue and teeth/);
  });
});
