import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeTake,
  formatElapsed,
  initialTakeState,
  isBusy,
  isCapturing,
  MAX_TAKE_MS,
  MIN_TAKE_MS,
  takeReducer,
  WARN_TAKE_MS,
  type TakeEvent,
  type TakeState,
} from "../src/audio/take-machine.ts";

function run(events: TakeEvent[], from: TakeState = initialTakeState): TakeState {
  return events.reduce(takeReducer, from);
}

/** The happy path, all the way from a tap to a scored take. */
const grantedAndRecording: TakeEvent[] = [
  { type: "PRESS" },
  { type: "PERMISSION", granted: true },
  { type: "STARTED" },
];

describe("permission handling", () => {
  it("asks before recording", () => {
    assert.equal(run([{ type: "PRESS" }]).status, "requesting");
  });

  it("records once permission is granted", () => {
    assert.equal(run(grantedAndRecording).status, "recording");
  });

  it("lands in a denied state with a way out, not a dead end", () => {
    const state = run([{ type: "PRESS" }, { type: "PERMISSION", granted: false }]);
    assert.equal(state.status, "denied");
    assert.match(state.message ?? "", /Settings/);
    assert.equal(describeTake(state).showSettingsLink, true);
  });

  it("lets a denied learner retry after fixing it in Settings", () => {
    const denied = run([{ type: "PRESS" }, { type: "PERMISSION", granted: false }]);
    const retried = takeReducer(denied, { type: "PRESS" });
    assert.equal(retried.status, "requesting");
    assert.equal(retried.message, null, "the old denial copy must not linger");
  });

  it("ignores a stray permission result that arrives late", () => {
    const recording = run(grantedAndRecording);
    assert.deepEqual(takeReducer(recording, { type: "PERMISSION", granted: false }), recording);
  });
});

describe("recording and the duration cap", () => {
  it("tracks elapsed time while recording", () => {
    const state = run([...grantedAndRecording, { type: "TICK", elapsedMs: 2400 }]);
    assert.equal(state.elapsedMs, 2400);
    assert.equal(state.status, "recording");
  });

  it("stops itself at the cap instead of uploading a huge file", () => {
    const state = run([...grantedAndRecording, { type: "TICK", elapsedMs: MAX_TAKE_MS + 500 }]);
    assert.equal(state.status, "stopping");
    assert.equal(state.elapsedMs, MAX_TAKE_MS);
  });

  it("warns before it cuts the learner off", () => {
    const calm = run([...grantedAndRecording, { type: "TICK", elapsedMs: 1000 }]);
    assert.equal(describeTake(calm).tone, "active");

    const nearCap = run([...grantedAndRecording, { type: "TICK", elapsedMs: WARN_TAKE_MS + 100 }]);
    assert.equal(describeTake(nearCap).tone, "warning");
    assert.match(describeTake(nearCap).text, /wrapping up/);
  });

  it("ignores ticks when it is not recording", () => {
    assert.deepEqual(takeReducer(initialTakeState, { type: "TICK", elapsedMs: 9000 }), initialTakeState);
  });

  it("treats a second press as stop", () => {
    const state = run([...grantedAndRecording, { type: "PRESS" }]);
    assert.equal(state.status, "stopping");
  });
});

describe("capturing a take", () => {
  it("moves to processing for a take of usable length", () => {
    const state = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: 2000, uri: "file:///take.wav" },
    ]);
    assert.equal(state.status, "processing");
    assert.equal(state.elapsedMs, 2000);
    assert.equal(isBusy(state), true);
  });

  it("rejects a mis-tap rather than scoring 0.2 seconds of silence", () => {
    const state = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: MIN_TAKE_MS - 1, uri: "file:///take.wav" },
    ]);
    assert.equal(state.status, "error");
    assert.match(state.message ?? "", /too short/i);
  });

  it("accepts a take exactly at the minimum", () => {
    const state = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: MIN_TAKE_MS, uri: "file:///take.wav" },
    ]);
    assert.equal(state.status, "processing");
  });

  it("reports a recording the platform failed to save", () => {
    const state = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: 3000, uri: null },
    ]);
    assert.equal(state.status, "error");
    assert.match(state.message ?? "", /could not be saved/i);
  });

  it("returns to idle once the score comes back", () => {
    const processing = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: 1500, uri: "file:///take.wav" },
    ]);
    const done = takeReducer(processing, { type: "SCORED" });
    assert.equal(done.status, "idle");
    assert.equal(done.message, null);
  });

  it("surfaces a scoring failure with the server's own wording", () => {
    const processing = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: 1500, uri: "file:///take.wav" },
    ]);
    const failed = takeReducer(processing, { type: "FAILED", message: "Scoring is offline." });
    assert.equal(failed.status, "error");
    assert.equal(failed.message, "Scoring is offline.");
    assert.equal(isBusy(failed), false, "an error must never leave the button disabled");
  });
});

describe("interruptions", () => {
  it("throws away a take the system cut short and says why", () => {
    const state = run([...grantedAndRecording, { type: "TICK", elapsedMs: 3000 }, { type: "INTERRUPTED" }]);
    assert.equal(state.status, "error");
    assert.equal(state.interrupted, true);
    assert.match(state.message ?? "", /took over the microphone/i);
  });

  it("interrupts a take that is already stopping", () => {
    const state = run([...grantedAndRecording, { type: "PRESS" }, { type: "INTERRUPTED" }]);
    assert.equal(state.status, "error");
    assert.equal(state.interrupted, true);
  });

  it("is a no-op when nothing is being recorded", () => {
    assert.deepEqual(takeReducer(initialTakeState, { type: "INTERRUPTED" }), initialTakeState);
    const processing = run([
      ...grantedAndRecording,
      { type: "PRESS" },
      { type: "CAPTURED", durationMs: 1500, uri: "file:///t.wav" },
    ]);
    assert.deepEqual(takeReducer(processing, { type: "INTERRUPTED" }), processing);
  });
});

describe("guards against double taps", () => {
  for (const status of ["requesting", "stopping", "processing"] as const) {
    it(`ignores a press while ${status}`, () => {
      const state: TakeState = { ...initialTakeState, status };
      assert.deepEqual(takeReducer(state, { type: "PRESS" }), state);
    });
  }

  it("knows when the native recorder should be live", () => {
    assert.equal(isCapturing(run(grantedAndRecording)), true);
    assert.equal(isCapturing(run([...grantedAndRecording, { type: "PRESS" }])), true);
    assert.equal(isCapturing(initialTakeState), false);
  });
});

describe("RESET", () => {
  it("clears any state back to the start", () => {
    const errored = run([{ type: "PRESS" }, { type: "PERMISSION", granted: false }]);
    assert.deepEqual(takeReducer(errored, { type: "RESET" }), initialTakeState);
  });
});

describe("formatElapsed", () => {
  it("is mm:ss and pads the seconds", () => {
    assert.equal(formatElapsed(0), "0:00");
    assert.equal(formatElapsed(5_000), "0:05");
    assert.equal(formatElapsed(65_400), "1:05");
    assert.equal(formatElapsed(-100), "0:00");
  });
});

describe("describeTake", () => {
  it("uses the caller's copy when idle", () => {
    assert.equal(
      describeTake(initialTakeState, { fallback: "Exam mode: one careful take per word." }).text,
      "Exam mode: one careful take per word.",
    );
  });

  it("acknowledges an existing take when there is no caller copy", () => {
    assert.match(describeTake(initialTakeState, { hasTake: true }).text, /record it again/i);
    assert.match(describeTake(initialTakeState).text, /read the target out loud/i);
  });

  it("never returns empty copy for any reachable state", () => {
    const states: TakeState[] = [
      initialTakeState,
      { ...initialTakeState, status: "requesting" },
      { ...initialTakeState, status: "denied", message: null },
      { ...initialTakeState, status: "recording" },
      { ...initialTakeState, status: "stopping" },
      { ...initialTakeState, status: "processing" },
      { ...initialTakeState, status: "error", message: null },
    ];
    for (const state of states) {
      assert.ok(describeTake(state).text.length > 0, `empty hint for ${state.status}`);
    }
  });
});
