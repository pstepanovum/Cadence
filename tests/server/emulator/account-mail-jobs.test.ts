// FILE: tests/server/emulator/account-mail-jobs.test.ts
//
// Account deletion and export, mail delivery (dry run: nothing leaves the
// machine), sign-in notices, and the daily job, against the emulators.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { DAY, clearAuth, clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { auth, db } from "../../../src/lib/server/firebase.ts";
import { exportAccount, requestDeletion } from "../../../src/lib/server/account.ts";
import { deliverMail, deliverPending, mailKey, queueMail } from "../../../src/lib/server/email/queue.ts";
import { noteSignIn } from "../../../src/lib/server/account-events.ts";
import { runDailyJob } from "../../../src/lib/server/jobs.ts";
import { applyActivities } from "../../../src/lib/server/sync.ts";

const NOW = Date.now();
const today = new Date(NOW).toISOString().slice(0, 10);

describe("account export and deletion", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("exports the account and deletes everything, calling every outside service once", async () => {
    const { uid, email } = await signUp();
    await db().collection("users").doc(uid).set({ email, stripeCustomerId: "cus_1", security: { devices: ["x"] } });
    await applyActivities(uid, [{ kind: "quiz", refId: "quiz.a", level: "B1", score: 70, minutes: 3, day: today, at: NOW }]);
    await db().collection("usage").doc(uid).collection("days").doc(today).set({ audioSeconds: 10, ttsCharacters: 0, coachTurns: 0 });

    const exported = await exportAccount(uid);
    assert.equal(exported.uid, uid);
    assert.ok((exported.account as Record<string, unknown>).progress);
    assert.equal(((exported.account as { data: Record<string, unknown> }).data).security, undefined, "no security hashes in the export");

    const calls: string[] = [];
    const result = await requestDeletion(uid, email, {
      deleteSubscriber: async () => calls.push("revenuecat"),
      detachStripe: async (customer) => void calls.push(`stripe:${customer}`),
      deleteBrevoContact: async () => void calls.push("brevo"),
    });
    assert.equal(result.status, "completed");
    assert.deepEqual(calls, ["revenuecat", "stripe:cus_1", "brevo"]);
    assert.equal((await db().collection("users").doc(uid).get()).exists, false);
    assert.equal((await db().collection("users").doc(uid).collection("progress").doc("summary").get()).exists, false);
    assert.equal((await db().collection("usage").doc(uid).collection("days").get()).size, 0);
    await assert.rejects(auth().getUser(uid));
    const mail = (await db().collection("mailQueue").get()).docs.map((d) => d.data().template).sort();
    assert.deepEqual(mail, ["account-deleted", "deletion-scheduled"]);
  });

  it("retries a failed step later and finishes then", async () => {
    const { uid, email } = await signUp();
    await db().collection("users").doc(uid).set({ email });
    const first = await requestDeletion(uid, email, { deleteSubscriber: async () => { throw new Error("RevenueCat down"); }, deleteBrevoContact: async () => undefined });
    assert.equal(first.status, "pending");
    assert.deepEqual(first.failed, ["revenuecat"]);
    const report = await runDailyJob({ now: NOW });
    assert.equal(report.deletionsRetried, 1);
  });
});

describe("mail delivery", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("delivers once, skips reminders for learners who did not opt in", async () => {
    const { uid } = await signUp();
    await db().collection("users").doc(uid).set({ emailPrefs: { reminders: false } });
    const welcome = mailKey("welcome", uid);
    assert.equal(await queueMail(welcome, { template: "welcome", uid, props: {} }), true);
    assert.equal(await queueMail(welcome, { template: "welcome", uid, props: {} }), false, "a key queues once");
    assert.equal(await deliverMail(welcome), "sent");
    assert.equal(await deliverMail(welcome), "busy");

    const reminder = mailKey("streak", uid);
    await queueMail(reminder, { template: "streak-at-risk", uid, props: { streak: 4 } });
    assert.equal(await deliverMail(reminder), "skipped");

    await db().collection("users").doc(uid).set({ emailPrefs: { reminders: true } }, { merge: true });
    const second = mailKey("streak2", uid);
    await queueMail(second, { template: "streak-at-risk", uid, props: { streak: 4 } });
    const tally = await deliverPending();
    assert.equal(tally.sent, 1);
  });

  it("notes a new account, a new device and a changed email", async () => {
    const { uid, email } = await signUp();
    const first = await noteSignIn({ uid, email, emailVerified: true, userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15" }, { addContact: async () => undefined });
    assert.deepEqual(first, [mailKey("welcome", uid)]);
    const same = await noteSignIn({ uid, email, emailVerified: true, userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15" });
    assert.deepEqual(same, []);
    const phone = await noteSignIn({ uid, email, emailVerified: true, userAgent: "Cadence/2 CFNetwork iPhone" });
    assert.equal(phone.length, 1);
    assert.match(phone[0], /^new-sign-in:/);
    await auth().updateUser(uid, { email: `new-${email}` });
    const changed = await noteSignIn({ uid, email: `new-${email}`, emailVerified: true, userAgent: "Cadence/2 CFNetwork iPhone" });
    assert.equal(changed.filter((key) => key.startsWith("email-changed")).length, 2);
  });
});

describe("daily job", { skip }, () => {
  beforeEach(clearFirestore);

  it("purges detail 90 days after a lapse, keeps it for renewed Plus", async () => {
    const lapsed = db().collection("users").doc("lapsed");
    await lapsed.set({ detailPurgeAt: NOW - 1000, plus: { ...plusRecord("stripe", NOW), active: false } });
    await lapsed.collection("srs").doc("core-b1").set({ cards: {} });
    await lapsed.collection("progress").doc("summary").set({ schema: 1, totalMinutes: 5 });
    const renewed = db().collection("users").doc("renewed");
    const record = plusRecord("stripe", NOW);
    await renewed.set({ detailPurgeAt: NOW - 1000, plus: record, plusSources: { stripe: record } });
    await renewed.collection("srs").doc("core-b1").set({ cards: {} });

    const report = await runDailyJob({ now: NOW });
    assert.equal(report.purged, 1);
    assert.equal((await lapsed.collection("srs").get()).size, 0);
    assert.equal((await lapsed.collection("progress").doc("summary").get()).exists, true, "the summary stays");
    assert.equal((await renewed.collection("srs").get()).size, 1);
  });

  it("queues trial-ending two days ahead for web trials only", async () => {
    const trial = plusRecord("stripe", NOW, { trial: true, expiresAt: NOW + 2 * DAY });
    await db().collection("users").doc("trialing").set({ plus: trial, plusSources: { stripe: trial } });
    await runDailyJob({ now: NOW });
    await runDailyJob({ now: NOW });
    const queued = await db().collection("mailQueue").where("template", "==", "trial-ending").get();
    assert.equal(queued.size, 1);
  });
});
