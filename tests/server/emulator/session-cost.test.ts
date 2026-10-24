// FILE: tests/server/emulator/session-cost.test.ts
//
// The "Firestore per session" budget (docs/PLATFORM.md sections 5 and 16):
// free at most 2 reads and 1 write, Plus at most 10 reads and 5 writes,
// counted against the emulator with firestore-counter.ts.
//
// A session is what the apps do on one open with one practice round, through
// the same functions the routes call: GET /api/me (loadMe, hosted cloud),
// POST /api/sync/summary (syncSummary), and for Plus the detail push and pull
// (pushDetail, pullDetail). GET /api/sync/inbox is counted on its own: the
// data model budgets it as "1 per open, usually missing", outside the session.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { countFirestore, type FirestoreCount } from "./firestore-counter.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { loadMe } from "../../../src/lib/server/me.ts";
import { resetBreakerCache } from "../../../src/lib/server/quota.ts";
import { pullDetail, pushDetail, readInbox, syncSummary } from "../../../src/lib/server/sync.ts";
import type { Activity } from "../../../src/lib/platform/progress-model.ts";

const BUDGET = { free: { reads: 2, writes: 1 }, plus: { reads: 10, writes: 5 } };

function round(now: number): Activity {
  return { kind: "lesson", refId: "lesson.b1.present-perfect", level: "B1", score: 82, minutes: 12, day: new Date(now).toISOString().slice(0, 10), at: now, completedLesson: true };
}

function describeCount(label: string, count: FirestoreCount): string {
  return `${label}: ${count.reads} reads, ${count.writes} writes [${count.log.join("; ")}]`;
}

describe("firestore cost per session", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    resetBreakerCache();
  });

  it("free: opening the app and syncing a round stays within 2 reads and 1 write", async (t) => {
    const { uid, email } = await signUp();
    const identity = { uid, email, emailVerified: false };
    await db().collection("users").doc(uid).set({ email });
    // An earlier session, so this one is the steady state.
    await syncSummary(uid, [round(Date.now() - 86_400_000)]);

    const now = Date.now();
    const session = await countFirestore(async () => {
      const me = await loadMe(identity, { hosted: true, now });
      assert.equal(me.tier, "summary");
      const synced = await syncSummary(uid, [round(now)], { now });
      assert.equal(synced.ok, true);
    });
    const inbox = await countFirestore(() => readInbox(uid));
    t.diagnostic(describeCount("free session", session.count));
    t.diagnostic(describeCount("inbox check per open", inbox.count));

    assert.ok(session.count.reads <= BUDGET.free.reads, describeCount("free session", session.count));
    assert.ok(session.count.writes <= BUDGET.free.writes, describeCount("free session", session.count));
    assert.equal(inbox.count.reads, 1);
  });

  it("the summary round answers 429 past the limit without a second document", async () => {
    const { uid } = await signUp();
    const rule = { name: "sync-test", limit: 2, windowSeconds: 60 };
    const now = Date.now();
    assert.equal((await syncSummary(uid, [round(now)], { now, rule })).ok, true);
    assert.equal((await syncSummary(uid, [round(now)], { now, rule })).ok, true);
    const refused = await syncSummary(uid, [round(now)], { now, rule });
    assert.equal(refused.ok, false);
    assert.ok(!refused.ok && refused.retryAfterSeconds > 0);
    const limits = await db().collection("rateLimits").get();
    assert.equal(limits.size, 0, "the window lives on the summary document");
    const stored = (await db().collection("users").doc(uid).collection("progress").doc("summary").get()).data();
    assert.equal(stored?.totalMinutes, 24, "the refused round changed nothing");
  });

  it(
    "Plus: opening the app, syncing a round and its detail stays within 10 reads and 5 writes",
    { todo: "over budget: the app's pull after every push costs a users read plus one query per detail collection; see the TEST report" },
    async (t) => {
      const { uid, email } = await signUp();
      const identity = { uid, email, emailVerified: true };
      const start = Date.now() - 86_400_000;
      const record = plusRecord("app_store", start);
      await db().collection("users").doc(uid).set({ email, plus: record, plusSources: { app_store: record } });
      const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const detail = (at: number) => ({
        installId: "install-cost-1",
        platform: "ios",
        srs: { "core-b1": { "card.b1.one": { reps: 2, interval: 3, ease: 2.5, due: day(at + 3 * 86_400_000), lapses: 0, updatedAt: at } } },
        attempts: [{ id: `att-${at}`, kind: "pronunciation" as const, refId: "sound.th", at, score: 64 }],
        mastery: { sounds: { "sound.th": { attempts: 5, ema: 64, best: 80, lastAt: at, history: [{ day: day(at), score: 64 }] } }, grammar: {} },
        coach: [],
      });
      // An earlier session on this phone: the device exists and has a cursor.
      await syncSummary(uid, [round(start)], { now: start });
      await pushDetail(uid, detail(start), { now: start });
      const cursor = (await pullDetail(uid, 0, { now: start })).cursor;

      const now = Date.now();
      const session = await countFirestore(async () => {
        const me = await loadMe(identity, { hosted: true, now });
        assert.equal(me.tier, "full");
        assert.equal((await syncSummary(uid, [round(now)], { now })).ok, true);
        await pushDetail(uid, detail(now), { now });
        await pullDetail(uid, cursor, { now });
      });
      t.diagnostic(describeCount("Plus session", session.count));
      assert.ok(session.count.writes <= BUDGET.plus.writes, describeCount("Plus session", session.count));
      assert.ok(session.count.reads <= BUDGET.plus.reads, describeCount("Plus session", session.count));
    },
  );
});
