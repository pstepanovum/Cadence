// FILE: tests/server/teacher.test.ts
//
// The pure parts of the connector's teacher tools and the advanced sync
// (no emulator): drill-session tokens, the push body validator, and the
// last-writer-wins card merge.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.QUIZ_TOKEN_SECRET ||= "test-quiz-secret-that-is-long-enough-000";

const { signDrill, verifyDrill } = await import("../../src/lib/mcp/teacher-tools.ts");
const { signQuiz, verifyQuiz } = await import("../../src/lib/mcp/quiz.ts");
const { isDrillStepId, isReviewItemId, mergeCards, parseAdvancedPush } = await import("../../src/lib/server/mcp-teacher-store.ts");

const card = (updatedAt: number) => ({ reps: 1, interval: 1, ease: 2.5, due: "2026-10-25", lapses: 0, updatedAt });

describe("drill sessions", () => {
  it("verify only for the same learner, before expiry, and never as a quiz", () => {
    const token = signDrill({ uid: "u1", ids: ["phrase.to-be-fair", "fossil.th-sounds#d1"], exp: 2000 });
    assert.deepEqual(verifyDrill(token, "u1", 1000)?.ids, ["phrase.to-be-fair", "fossil.th-sounds#d1"]);
    assert.equal(verifyDrill(token, "u2", 1000), null);
    assert.equal(verifyDrill(token, "u1", 3000), null);
    assert.equal(verifyDrill(`${token}x`, "u1", 1000), null);
    assert.equal(verifyQuiz(token, "u1", 1000), null);
    assert.equal(verifyDrill(signQuiz({ uid: "u1", ids: ["x"], exp: 2000 }), "u1", 1000), null);
  });
});

describe("advanced sync input", () => {
  it("accepts a well-formed push and refuses malformed parts", () => {
    const good = parseAdvancedPush({ installId: "install-12345", cards: { "phrase.to-be-fair": card(5) }, recordings: { upsert: [], remove: [] } });
    assert.ok(good.ok);
    assert.equal(parseAdvancedPush(null).ok, false);
    assert.equal(parseAdvancedPush({ installId: "x" }).ok, false);
    assert.equal(parseAdvancedPush({ installId: "install-12345", cards: { "card.b1.x": card(1) } }).ok, false);
    assert.equal(parseAdvancedPush({ installId: "install-12345", cards: { "phrase.x": { ...card(1), ease: 40 } } }).ok, false);
    assert.equal(parseAdvancedPush({ installId: "install-12345", track: { format: 9 } }).ok, false);
    assert.equal(parseAdvancedPush({ installId: "install-12345", recordings: { upsert: [{ id: "bad" }] } }).ok, false);
  });

  it("merges cards by their own time, newest wins", () => {
    const { cards, changed } = mergeCards({ "phrase.a": card(10), "phrase.b": card(10) }, { "phrase.a": { ...card(20), reps: 2 }, "phrase.b": { ...card(5), reps: 9 }, "slang.c": card(1) });
    assert.equal(changed, 2);
    assert.equal(cards["phrase.a"].reps, 2);
    assert.equal(cards["phrase.b"].reps, 1);
    assert.ok(cards["slang.c"]);
  });

  it("knows review items from plateau steps", () => {
    assert.ok(isReviewItemId("phrase.to-be-fair") && isReviewItemId("slang.mid"));
    assert.ok(!isReviewItemId("fossil.x#d1"));
    assert.ok(isDrillStepId("fossil.th-sounds#d3") && isDrillStepId("own.abc123"));
    assert.ok(!isDrillStepId("phrase.to-be-fair"));
  });
});
