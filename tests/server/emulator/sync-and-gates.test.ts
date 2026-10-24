// FILE: tests/server/emulator/sync-and-gates.test.ts
//
// Data tiers, quotas, the circuit breaker and the AI gate against the
// emulators: free accounts write only the summary, Plus detail merges and
// imports once, quotas answer 429, the breaker 503, App Check 401.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { clearAuth, clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { TierError, acknowledgeInbox, addToInbox, applyActivities, getSummary, pullDetail, pushDetail, readInbox } from "../../../src/lib/server/sync.ts";
import { chargeUsage, isBreakerTripped, recordSpend, resetBreakerCache } from "../../../src/lib/server/quota.ts";
import { authorizeAi, chargeAi } from "../../../src/lib/server/ai-gate.ts";
import { PLUS_DAILY_LIMITS } from "../../../src/lib/platform/engine-routing.ts";

const NOW = Date.now();
const today = new Date(NOW).toISOString().slice(0, 10);

async function makePlus(uid: string) {
  const record = plusRecord("stripe", NOW);
  await db().collection("users").doc(uid).set({ plus: record, plusSources: { stripe: record } }, { merge: true });
}

const push = (installId: string, at = NOW) => ({
  installId,
  platform: "ios",
  srs: { "core-b1": { "card.b1.one": { reps: 1, interval: 1, ease: 2.5, due: today, lapses: 0, updatedAt: at } } },
  attempts: [{ id: `att-${installId}`, kind: "pronunciation" as const, refId: "sound.th", at, score: 70 }],
  mastery: { sounds: { "sound.th": { attempts: 3, ema: 60, best: 80, lastAt: at, history: [] } }, grammar: {} },
  coach: [],
});

describe("data tiers", { skip }, () => {
  beforeEach(clearFirestore);

  it("a free account keeps one summary document and nothing else", async () => {
    const uid = "freeUser";
    await db().collection("users").doc(uid).set({ email: "f@example.com" });
    const summary = await applyActivities(uid, [{ kind: "lesson", refId: "lesson.a1.hi", level: "A1", score: 90, minutes: 5, day: today, at: NOW, completedLesson: true }]);
    assert.equal(summary.lessonsCompleted.A1, 1);
    assert.equal((await getSummary(uid)).totalMinutes, 5);
    await assert.rejects(pushDetail(uid, push("install-free-1")), TierError);
    await assert.rejects(pullDetail(uid, 0), TierError);
    const collections = (await db().collection("users").doc(uid).listCollections()).map((c) => c.id);
    assert.deepEqual(collections, ["progress"]);
  });

  it("Plus detail merges last writer wins and imports once per install", async () => {
    const uid = "plusUser";
    await makePlus(uid);
    const first = await pushDetail(uid, push("install-plus-1"), { importing: true });
    assert.equal(first.cardsChanged, 1);
    assert.equal(first.newDevice, true);
    const again = await pushDetail(uid, push("install-plus-1"), { importing: true });
    assert.equal(again.alreadyImported, true);
    const older = await pushDetail(uid, { ...push("install-plus-2", NOW - 1000), attempts: [] });
    assert.equal(older.cardsChanged, 0, "an older card state does not win");
    const pulled = await pullDetail(uid, 0);
    assert.equal(Object.keys(pulled.srs["core-b1"]).length, 1);
    assert.equal(pulled.attempts.length, 1);
    const queued = await db().collection("mailQueue").where("template", "==", "device-paired").get();
    assert.equal(queued.size, 2, "one device-paired email per new install");
  });

  it("the MCP inbox caps at 200 and empties on acknowledgement", async () => {
    const uid = "inboxUser";
    const cards = Array.from({ length: 210 }, (_, i) => ({ id: `card.mcp.${i}`, front: `f${i}`, back: `b${i}` }));
    const result = await addToInbox(uid, cards);
    assert.equal(result.queued, 200);
    assert.equal(result.dropped, 10);
    assert.equal(await acknowledgeInbox(uid, ["card.mcp.0"]), 1);
    assert.equal((await readInbox(uid)).length, 199);
    await acknowledgeInbox(uid, "all");
    assert.equal((await db().collection("users").doc(uid).collection("inbox").doc("flashcards").get()).exists, false);
  });
});

describe("quotas and the breaker", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    resetBreakerCache();
  });

  it("charges up to the daily ceiling and refuses past it", async () => {
    const turns = PLUS_DAILY_LIMITS.coachTurns;
    for (let i = 0; i < turns; i += 1) assert.equal((await chargeUsage("q", "coach", {})).allowed, true);
    const refused = await chargeUsage("q", "coach", {});
    assert.equal(refused.allowed, false);
  });

  it("trips once the day's estimated spend passes the budget", async () => {
    assert.equal(await isBreakerTripped(), false);
    await recordSpend("placement", { audioSeconds: 30, ttsCharacters: 0, coachTurns: 1 }, { budgetUsd: 0.001 });
    resetBreakerCache();
    assert.equal(await isBreakerTripped(), true);
  });
});

describe("the AI gate on the hosted cloud", { skip }, () => {
  const saved = { ...process.env };
  before(() => {
    process.env.CADENCE_DEPLOYMENT = "cloud";
    process.env.APP_CHECK_ENFORCE = "0";
  });
  after(() => {
    for (const key of ["CADENCE_DEPLOYMENT", "APP_CHECK_ENFORCE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
    resetBreakerCache();
  });

  const request = (token?: string, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/assess", { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });

  it("asks a signed-out caller to sign in or connect their own Cadence", async () => {
    const result = await authorizeAi(request(), "score");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.response.status, 401);
      const body = (await result.response.json()) as { error: string; offers: string[] };
      assert.equal(body.error, "needs_sign_in");
      assert.deepEqual(body.offers, ["connect_own_server", "sign_in"]);
    }
  });

  it("offers Plus or your own Cadence to a free account", async () => {
    const { idToken } = await signUp();
    const result = await authorizeAi(request(idToken), "coach");
    assert.equal(result.ok ? 200 : result.response.status, 402);
  });

  it("lets Plus through until the daily limit, then 429 with the message", async () => {
    const { uid, idToken } = await signUp();
    await makePlus(uid);
    const access = await authorizeAi(request(idToken), "score");
    assert.equal(access.ok, true);
    if (!access.ok) return;
    await db().collection("usage").doc(uid).collection("days").doc(new Date().toISOString().slice(0, 10)).set({ audioSeconds: PLUS_DAILY_LIMITS.audioSeconds, ttsCharacters: 0, coachTurns: 0 });
    const charged = await chargeAi(access, "score", { audioSeconds: 5 });
    assert.equal(charged.ok, false);
    if (!charged.ok) {
      assert.equal(charged.response.status, 429);
      const body = (await charged.response.json()) as { error: string; message: string };
      assert.equal(body.error, "daily_limit");
      assert.match(body.message, /Connect your own Cadence/);
    }
  });

  it("answers 503 cloud_paused once the breaker trips", async () => {
    const { uid, idToken } = await signUp();
    await makePlus(uid);
    await recordSpend("coach", { audioSeconds: 0, ttsCharacters: 0, coachTurns: 1 }, { budgetUsd: 0.000001 });
    resetBreakerCache();
    const result = await authorizeAi(request(idToken), "coach");
    assert.equal(result.ok ? 200 : result.response.status, 503);
  });

  it("refuses a request without App Check when it is enforced", async () => {
    process.env.APP_CHECK_ENFORCE = "1";
    try {
      const result = await authorizeAi(request(), "score");
      assert.equal(result.ok ? 200 : result.response.status, 401);
      if (!result.ok) assert.equal(((await result.response.json()) as { error: string }).error, "app_check_failed");
    } finally {
      process.env.APP_CHECK_ENFORCE = "0";
    }
  });

  it("never gates an own Cadence", async () => {
    process.env.CADENCE_DEPLOYMENT = "self-hosted";
    try {
      const result = await authorizeAi(request(), "score");
      assert.deepEqual(result, { ok: true, mode: "own" });
    } finally {
      process.env.CADENCE_DEPLOYMENT = "cloud";
    }
  });
});

