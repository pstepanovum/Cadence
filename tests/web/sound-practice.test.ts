// FILE: tests/web/sound-practice.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceDrill,
  DRILL_STEPS,
  recordScore,
  reviewsDue,
  soundsToFix,
  TAKES_TO_PASS,
  type SoundStore,
} from "../../src/components/mouth-map/sound-practice.ts";

const now = new Date(2026, 9, 24, 9);

describe("sounds to fix", () => {
  it("orders weak sounds by error rate times how common they are", () => {
    let store: SoundStore = {};
    store = recordScore(store, "sound.th", 40, now); // rare, weak
    store = recordScore(store, "sound.r", 50, now); // common, weak
    store = recordScore(store, "sound.s", 95, now); // fine
    const list = soundsToFix(store);
    assert.deepEqual(list.map((s) => s.soundId), ["sound.r", "sound.th"]);
  });

  it("keeps a moving average and one history entry per day", () => {
    let store: SoundStore = {};
    store = recordScore(store, "sound.l", 100, now);
    store = recordScore(store, "sound.l", 0, now);
    assert.equal(store["sound.l"].attempts, 2);
    assert.equal(store["sound.l"].ema, 70);
    assert.equal(store["sound.l"].history.length, 1);
    assert.equal(store["sound.l"].best, 100);
  });
});

describe("drill ladder", () => {
  it("passes a step after three good takes in a row and resets on a miss", () => {
    let state = advanceDrill(undefined, 85).state;
    state = advanceDrill(state, 60).state;
    assert.deepEqual(state, { step: 0, streak: 0 });
    let result = advanceDrill(state, 90);
    for (let i = 1; i < TAKES_TO_PASS; i += 1) result = advanceDrill(result.state, 90);
    assert.equal(result.passedStep, true);
    assert.deepEqual(result.state, { step: 1, streak: 0 });
  });

  it("finishes after the last step", () => {
    let result = advanceDrill({ step: DRILL_STEPS.length - 1, streak: TAKES_TO_PASS - 1 }, 99);
    assert.equal(result.finished, true);
    result = advanceDrill(result.state, 99);
    assert.equal(result.finished, true);
  });
});

describe("spaced review of fixed sounds", () => {
  it("brings a fixed sound back on day 1, 3, 7 and 21", () => {
    const store: SoundStore = {
      "sound.th": { attempts: 9, ema: 90, best: 95, lastAt: 0, history: [{ day: "2026-10-01", score: 90 }], fixedAt: "2026-10-01" },
    };
    assert.deepEqual(reviewsDue(store, "2026-10-01"), []);
    assert.deepEqual(reviewsDue(store, "2026-10-02"), ["sound.th"]);
    store["sound.th"].history.push({ day: "2026-10-02", score: 90 });
    assert.deepEqual(reviewsDue(store, "2026-10-03"), []);
    assert.deepEqual(reviewsDue(store, "2026-10-04"), ["sound.th"]);
  });
});
