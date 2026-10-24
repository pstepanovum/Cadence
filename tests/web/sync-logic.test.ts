// FILE: tests/web/sync-logic.test.ts
//
// The web's sync bodies pass the server's own validators, and pulled cards
// merge last-writer-wins with this browser's.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addInboxCards, cardsSince, marksFor, mergePulledCards, pushBodies } from "../../src/components/learn-hub/sync-logic.ts";
import { parsePush } from "../../src/lib/server/sync-input.ts";
import { review } from "../../src/lib/platform/srs.ts";

const day = new Date(2026, 9, 24, 12);

describe("web progress sync", () => {
  it("sends only cards changed since the last push, in bodies the server accepts", () => {
    const states = {
      "ex.b1.vocab.travel": { ...review(undefined, "good", day), updatedAt: 2000 },
      "ex.b1.vocab.ticket": { ...review(undefined, "easy", day), updatedAt: 500 },
      "card.custom.abc-0": { ...review(undefined, "hard", day), updatedAt: 3000 },
    };
    const changed = cardsSince(states, 1000);
    assert.deepEqual(Object.keys(changed).sort(), ["card.custom.abc-0", "ex.b1.vocab.travel"]);
    const [body] = pushBodies("web-0123456789abcdef", changed);
    assert.deepEqual(Object.keys(body.srs).sort(), ["cards", "custom"]);
    const parsed = parsePush(body);
    assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  });

  it("uploads cards saved before sync existed on the first import", () => {
    const legacy = { "ex.a2.vocab.cat": { reps: 1, interval: 1, ease: 2.5, due: "2026-10-25", lapses: 0 } };
    const all = cardsSince(legacy, 0);
    assert.equal(all["ex.a2.vocab.cat"].updatedAt, 1);
    assert.equal(parsePush(pushBodies("web-0123456789abcdef", all)[0]).ok, true);
    assert.deepEqual(cardsSince(legacy, 5), {});
  });

  it("splits a large deck to fit the server's cap", () => {
    const many = Object.fromEntries(Array.from({ length: 4500 }, (_, i) => [`ex.b2.vocab.w${i}`, { ...review(undefined, "good", day), updatedAt: 10 }]));
    const bodies = pushBodies("web-0123456789abcdef", many);
    assert.equal(bodies.length, 3);
    for (const body of bodies) assert.equal(parsePush(body).ok, true);
  });

  it("merges pulled cards last writer wins and keeps the cursor", () => {
    const local = { a: { ...review(undefined, "good", day), updatedAt: 5000 }, b: { ...review(undefined, "good", day), updatedAt: 1000 } };
    const pulled = {
      cursor: 9000,
      srs: { cards: { a: { ...review(undefined, "again", day), updatedAt: 4000 }, b: { ...review(undefined, "easy", day), updatedAt: 6000 }, c: { reps: 1, interval: 1, ease: 2.5, due: "2026-10-25", lapses: 0, updatedAt: 7000 }, bad: { reps: "x" } } },
    };
    const merged = mergePulledCards(local, pulled);
    assert.equal(merged.changed, 2);
    assert.equal(merged.cards.a.updatedAt, 5000, "the newer local review stays");
    assert.equal(merged.cards.b.updatedAt, 6000);
    assert.ok(merged.cards.c);
    assert.equal(merged.cards.bad, undefined);
    assert.equal(merged.cursor, "9000");
  });

  it("adds connector cards once and acknowledges every delivered id", () => {
    const first = addInboxCards([], [{ id: "i1", front: "serendipity", back: "a happy accident" }, { id: "i2", front: "", back: "x" }], 1000);
    assert.equal(first.added, 1);
    assert.deepEqual(first.ackIds, ["i1", "i2"]);
    assert.match(first.cards[0].id, /^card\.custom\./);
    const again = addInboxCards(first.cards, [{ id: "i3", front: "Serendipity", back: "dup" }], 2000);
    assert.equal(again.added, 0);
    assert.deepEqual(again.ackIds, ["i3"]);
  });

  it("starts fresh marks for a different account on the same browser", () => {
    const mine = { uid: "a", importedAt: 1, pushedAt: 2, pullCursor: "3" };
    assert.equal(marksFor(mine, "a"), mine);
    assert.deepEqual(marksFor(mine, "b"), { uid: "b", importedAt: null, pushedAt: 0, pullCursor: null });
  });
});
