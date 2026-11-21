// FILE: tests/server/emulator/lifecycle.test.ts
//
// The lifecycle sequence end to end against the emulators: who gets queued in
// their evening, exactly once (the per-user email log), consent rechecked at
// delivery (dry run, nothing leaves the machine), and unsubscribe through the
// real Firestore store, which never creates an account document.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Timestamp } from "firebase-admin/firestore";

import { DAY, clearAuth, clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { deliverMail, mailKey } from "../../../src/lib/server/email/queue.ts";
import { handleUnsubscribePost } from "../../../src/lib/server/email/unsubscribe-handler.ts";
import { firestoreUnsubscribeStore } from "../../../src/lib/server/email/unsubscribe-store.ts";
import { unsubscribeUrl } from "../../../src/lib/server/email/unsubscribe.ts";
import { runDailyJob } from "../../../src/lib/server/jobs.ts";
import { runLifecycleJob } from "../../../src/lib/server/lifecycle.ts";

// 19:30 UTC on 21 November 2026: evening for a learner in London (UTC).
const NOW = Date.UTC(2026, 10, 21, 19, 30);
const OFFER = { CADENCE_OFFER_CODE: "CADENCEHALF", CADENCE_OFFER_LABEL: "50% off", CADENCE_OFFER_ENDS: "2026-11-30" };

async function account(uid: string, daysAgo: number, extra: Record<string, unknown> = {}) {
  await db().collection("users").doc(uid).set({ email: `${uid}@example.com`, displayName: "Maria Lopez", timeZone: "Europe/London", createdAt: Timestamp.fromMillis(NOW - daysAgo * DAY + 3600_000), ...extra });
}

describe("lifecycle job", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("queues the due step once per account, logs it, and respects Plus and consent", async () => {
    await account("day1", 1);
    await account("day3", 3, { lifecycle: { sent: ["day1"] } });
    await account("plus", 1, { plusSources: { app_store: plusRecord("app_store", NOW) } });
    await account("tipsoff", 1, { emailPrefs: { lifecycle: false } });
    await account("sale", 10, { lifecycle: { sent: ["day1", "day3", "day6"] } }); // never chose: on
    await account("saleoptedout", 10, { emailPrefs: { newsletter: false }, lifecycle: { sent: ["day1", "day3", "day6"] } });
    await account("tokyo", 1, { timeZone: "Asia/Tokyo" }); // 04:30 there

    const first = await runLifecycleJob({ now: NOW, env: OFFER, deliver: false });
    assert.deepEqual(first.queued, { "lifecycle-start": 1, "lifecycle-habit": 1, "sale-offer": 1 });
    assert.equal(first.skipped["has plus"], 1);
    assert.equal(first.skipped["nothing due"], 2, "tips off, and news and offers off");
    assert.equal(first.skipped["not evening"], 1);

    const queue = await db().collection("mailQueue").get();
    assert.deepEqual(queue.docs.map((d) => d.id).sort(), [mailKey("lifecycle", "day1", "day1"), mailKey("lifecycle", "day3", "day3"), mailKey("lifecycle", "sale", "day10")].sort());
    const sale = queue.docs.find((d) => d.id.endsWith(":day10"))!.data();
    assert.equal(sale.props.code, "CADENCEHALF");
    assert.equal((await db().doc("users/day1/emailLog/lifecycle-day1").get()).exists, true);

    // A second run in the same evening queues nothing more.
    const second = await runLifecycleJob({ now: NOW + 30 * 60_000, env: OFFER, deliver: false });
    assert.deepEqual(second.queued, {});
    assert.equal((await db().collection("mailQueue").get()).size, 3);

    // Without an offer, the sale is not sent.
    await clearFirestore();
    await account("sale", 10, { lifecycle: { sent: ["day1", "day3", "day6"] } });
    assert.deepEqual((await runLifecycleJob({ now: NOW, env: {}, deliver: false })).queued, {});
  });

  it("delivers in a dry run, and skips at delivery once the learner opted out or got Plus", async () => {
    await account("a", 1);
    await account("b", 1);
    await runLifecycleJob({ now: NOW, env: OFFER, deliver: false });
    const getEmail = async (uid: string) => `${uid}@example.com`;
    const env = { ...process.env, EMAIL_DRY_RUN: "1", CADENCE_PUBLIC_ORIGIN: "http://localhost:3000" };

    assert.equal(await deliverMail(mailKey("lifecycle", "a", "day1"), { getEmail, env, now: NOW }), "sent");

    await db().collection("users").doc("b").set({ emailPrefs: { lifecycle: false } }, { merge: true });
    assert.equal(await deliverMail(mailKey("lifecycle", "b", "day1"), { getEmail, env, now: NOW }), "skipped");
    assert.equal((await db().collection("mailQueue").doc(mailKey("lifecycle", "b", "day1")).get()).data()?.reason, "lifecycle off");
  });

  it("unsubscribes through the real store, per category, never creating an account", async () => {
    await account("learner", 2, { emailPrefs: { reminders: true } });
    const store = firestoreUnsubscribeStore();
    const env = process.env;
    const post = (uid: string) =>
      handleUnsubscribePost(new Request(unsubscribeUrl(uid, "lifecycle", "http://localhost:3000", env), { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }) }), { store, env });

    assert.equal((await post("learner")).status, 200);
    const prefs = (await db().collection("users").doc("learner").get()).data()?.emailPrefs;
    assert.deepEqual(prefs, { reminders: true, lifecycle: false });
    assert.equal((await post("learner")).status, 200, "already unsubscribed is fine");

    assert.equal((await post("nobody")).status, 200);
    assert.equal((await db().collection("users").doc("nobody").get()).exists, false);

    // The next run sends no tips to the learner who left.
    assert.deepEqual((await runLifecycleJob({ now: NOW + DAY, env: OFFER, deliver: false })).queued, {});
  });

  it("an account holder's newsletter unsubscribe stores false, and the sale stops", async () => {
    const { uid, email } = await signUp();
    await account(uid, 10, { email, lifecycle: { sent: ["day1", "day3", "day6"] } });
    const store = firestoreUnsubscribeStore();
    const env = { ...process.env, EMAIL_DRY_RUN: "1" };
    assert.equal(await store.isUnsubscribed({ list: "newsletter", subject: email }), false, "on by default");
    const url = unsubscribeUrl(email, "newsletter", "http://localhost:3000", env);
    const response = await handleUnsubscribePost(new Request(url, { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }) }), { store, env });
    assert.equal(response.status, 200);
    assert.equal((await db().collection("users").doc(uid).get()).data()?.emailPrefs?.newsletter, false);
    assert.equal(await store.isUnsubscribed({ list: "newsletter", subject: email }), true);
    assert.deepEqual((await runLifecycleJob({ now: NOW, env: OFFER, deliver: false })).queued, {});
  });

  it("the daily job sends reminders to accounts that never chose, not to ones that turned them off", async () => {
    const today = new Date(NOW).toISOString().slice(0, 10);
    const yesterday = new Date(NOW - DAY).toISOString().slice(0, 10);
    for (const [uid, prefs] of [["unset", undefined], ["off", { reminders: false }]] as const) {
      await db().collection("users").doc(uid).set({ email: `${uid}@example.com`, ...(prefs ? { emailPrefs: prefs } : {}) });
      await db().collection("users").doc(uid).collection("progress").doc("summary").set({ schema: 1, streak: { current: 5, best: 5, lastDay: yesterday }, totalMinutes: 30, lessonsCompleted: {}, placementLevel: null, lastActiveAt: NOW - DAY, recent: [] });
    }
    await runDailyJob({ now: NOW });
    const queued = (await db().collection("mailQueue").where("template", "==", "streak-at-risk").get()).docs.map((d) => d.data().uid);
    assert.deepEqual(queued, ["unset"], `streak-at-risk for ${today}`);
  });
});
