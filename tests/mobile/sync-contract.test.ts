// The phone's sync bodies against the server's own validators, so the two
// sides cannot drift apart again: every request the app builds must parse.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detailSince,
  emptyLearningState,
  finishSession,
  pullCursorOf,
  pushPayloads,
  recordAnswer,
  remoteFromPull,
  reviewCard,
  summaryBatch,
  MAX_CARDS_PER_PUSH,
} from "../../mobile/src/learning/state.ts";
import { recordPhonemes } from "../../mobile/src/practice/sound-coach.ts";
import { parseActivities, parsePush } from "../../src/lib/server/sync-input.ts";
import type { Exercise } from "../../src/lib/platform/content-model.ts";

const AT = Date.UTC(2026, 9, 24, 12);
const DAY = "2026-10-24";

function practisedState() {
  let state = emptyLearningState();
  state = finishSession(state, { kind: "flashcards", refId: "flashcards:B2", level: "B2", score: 100, minutes: 1 }, AT, DAY).state;
  state = finishSession(state, { kind: "placement", refId: "placement.onboarding", level: "A2", score: 60, minutes: 2.4, placementLevel: "A2" }, AT + 1, DAY).state;
  state = reviewCard(state, "ex.vocab.abandon", "good", new Date(AT));
  state = { ...state, cards: { ...state.cards, "card.custom.abc-0": { ...state.cards["ex.vocab.abandon"] } } };
  const exercise = { id: "ex.b2.gap.1", kind: "gap_fill", grammarPointIds: ["gp.b2.passive"] } as unknown as Exercise;
  state = recordAnswer(state, exercise, { correct: true, score: 1 } as never, AT + 2, DAY);
  state = { ...state, sounds: recordPhonemes(state.sounds, [{ symbol: "θ", accuracy: 48 }], AT + 3, DAY) };
  return state;
}

describe("phone to server sync bodies", () => {
  it("summary batches parse", () => {
    const parsed = parseActivities({ activities: summaryBatch(practisedState()) }, AT + 10);
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  });

  it("import and push bodies parse", () => {
    const [first] = pushPayloads("1af87c7d-5a75-4c56-91b3-88d0da39e219", "ios", detailSince(practisedState(), 0));
    const parsed = parsePush(first);
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
    if (!parsed.ok) return;
    assert.deepEqual(Object.keys(parsed.value.srs).sort(), ["cards", "custom"]);
    assert.equal(parsed.value.attempts.length, 1);
  });

  it("splits large decks across requests", () => {
    const state = practisedState();
    const card = state.cards["ex.vocab.abandon"];
    const cards = Object.fromEntries(Array.from({ length: MAX_CARDS_PER_PUSH + 5 }, (_, i) => [`ex.vocab.w${i}`, card]));
    const payloads = pushPayloads("install-0001", "ios", detailSince({ ...state, cards }, 0));
    assert.equal(payloads.length, 2);
    for (const payload of payloads) assert.equal(parsePush(payload).ok, true);
  });

  it("reads a pull back into phone state", () => {
    const local = practisedState();
    const remote = remoteFromPull(
      {
        cursor: AT + 99,
        srs: { cards: { "ex.vocab.x": { reps: 1, interval: 1, ease: 2.5, due: DAY, lapses: 0, updatedAt: AT } }, mcp: { "card.mcp.1": { reps: 0, interval: 0, ease: 2.5, due: DAY, lapses: 0, updatedAt: AT } } },
        mastery: { sounds: { "sound.th": { attempts: 3, ema: 70, best: 80, lastAt: AT + 50, history: [{ day: DAY, score: 70 }] } }, grammar: {} },
      },
      local.sounds,
    );
    assert.deepEqual(Object.keys(remote.cards ?? {}).sort(), ["card.mcp.1", "ex.vocab.x"]);
    const sound = remote.sounds?.["sound.th"];
    assert.equal(sound?.ema, 70);
    assert.equal(typeof sound?.step, "number");
    assert.equal(pullCursorOf({ cursor: AT + 99 }), String(AT + 99));
  });
});
