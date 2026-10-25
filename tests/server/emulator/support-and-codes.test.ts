// FILE: tests/server/emulator/support-and-codes.test.ts
//
// The contact form, the owner's support and friend-code endpoints, and
// redeeming a code, run through their real handlers against the emulators.
// Mail is queued only (EMAIL_DRY_RUN=1 in helpers.ts): nothing leaves the machine.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { DAY, clearAuth, clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { readAccount } from "../../../src/lib/server/entitlement.ts";
import { deliverMail } from "../../../src/lib/server/email/queue.ts";
import { handleAdminSupportGet, handleAdminSupportPatch, handleAdminSupportReply, handleSupportPost } from "../../../src/lib/server/support-http.ts";
import { handleAdminCodesGet, handleAdminCodesPatch, handleAdminCodesPost, handleRedeemGet, handleRedeemPost } from "../../../src/lib/server/codes/http.ts";
import { redeemCode, revokeRedemption, deleteRedemptionsFor } from "../../../src/lib/server/codes/store.ts";
import { hashCode } from "../../../src/lib/server/codes/logic.ts";

const SECRET = "test-admin-secret-that-is-long-enough-0001";
process.env.ADMIN_SECRET = SECRET;
const ORIGIN = "http://127.0.0.1:3310";

let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": freshIp(), ...headers }, body: JSON.stringify(body) });
}
function patch(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { headers });
}
const admin = { Authorization: `Bearer ${SECRET}` };

const request = { email: "maria@example.com", topic: "help", message: "The TH score never moves past 60.", name: "Maria" };

describe("contact form", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("keeps the request and queues one email to the inbox with the writer as reply-to", async () => {
    const delivered: string[][] = [];
    const response = await handleSupportPost(post("/api/support", { ...request, platform: "web" }, { "user-agent": "Safari" }), { deliver: (keys) => delivered.push(keys) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });

    const stored = await db().collection("supportRequests").get();
    assert.equal(stored.size, 1);
    const data = stored.docs[0].data();
    assert.equal(data.status, "open");
    assert.equal(data.email, "maria@example.com");
    assert.equal(data.userAgent, "Safari");
    assert.equal(data.uid, undefined);

    const mail = await db().collection("mailQueue").get();
    assert.equal(mail.size, 1);
    const queued = mail.docs[0].data();
    assert.equal(queued.template, "support-request");
    assert.equal(queued.to, "support@cadence.pstepanov.dev");
    assert.deepEqual(queued.replyTo, { email: "maria@example.com", name: "Maria" });
    assert.equal(queued.props.requestId, stored.docs[0].id);
    assert.deepEqual(delivered, [[mail.docs[0].id]]);
    assert.equal(await deliverMail(mail.docs[0].id), "sent", "delivers in a dry run");
  });

  it("attaches a signed-in writer's uid", async () => {
    const { uid, idToken } = await signUp();
    const response = await handleSupportPost(post("/api/support", request, { Authorization: `Bearer ${idToken}` }));
    assert.equal(response.status, 200);
    const stored = (await db().collection("supportRequests").get()).docs[0].data();
    assert.equal(stored.uid, uid);
  });

  it("answers a bot that fills the hidden field as if accepted and keeps nothing", async () => {
    const response = await handleSupportPost(post("/api/support", { ...request, website: "https://spam.example" }));
    assert.equal(response.status, 200);
    assert.equal((await db().collection("supportRequests").get()).size, 0);
    assert.equal((await db().collection("mailQueue").get()).size, 0);
  });

  it("refuses an invalid request and names the field", async () => {
    const response = await handleSupportPost(post("/api/support", { ...request, email: "nope" }));
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { field: string }).field, "email");
  });

  it("allows five an hour from one address, then 429", async () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 5; i += 1) {
      const response = await handleSupportPost(post("/api/support", { ...request, email: `person${i}@example.com` }, headers));
      assert.equal(response.status, 200, `message ${i + 1}`);
    }
    const sixth = await handleSupportPost(post("/api/support", { ...request, email: "person6@example.com" }, headers));
    assert.equal(sixth.status, 429);
    assert.equal(((await sixth.json()) as { error: string }).error, "rate_limited");
    assert.equal((await db().collection("supportRequests").get()).size, 5);
  });
});

describe("support on the owner's dashboard", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it("needs the admin secret", async () => {
    assert.equal((await handleAdminSupportGet(get("/api/admin/support"))).status, 401);
    assert.equal((await handleAdminSupportGet(get("/api/admin/support", { Authorization: "Bearer wrong-secret-wrong-secret-wrong-secret" }))).status, 401);
  });

  it("lists requests, changes status, and replies by email", async () => {
    await handleSupportPost(post("/api/support", request));
    const list = (await (await handleAdminSupportGet(get("/api/admin/support?status=open", admin))).json()) as { requests: { id: string; status: string }[] };
    assert.equal(list.requests.length, 1);
    const id = list.requests[0].id;

    const delivered: string[][] = [];
    const reply = await handleAdminSupportReply(post("/api/admin/support", { id, message: "Try the compare view.", by: "owner@example.com" }, admin), { deliver: (keys) => delivered.push(keys) });
    assert.equal(reply.status, 200);
    const answered = ((await reply.json()) as { request: { status: string; replies: { message: string; by: string }[] } }).request;
    assert.equal(answered.status, "answered");
    assert.deepEqual(answered.replies.map((entry) => [entry.message, entry.by]), [["Try the compare view.", "owner@example.com"]]);

    const replyMail = (await db().collection("mailQueue").where("template", "==", "support-reply").get()).docs;
    assert.equal(replyMail.length, 1);
    assert.equal(replyMail[0].data().to, "maria@example.com");
    assert.equal(replyMail[0].data().replyTo.email, "support@cadence.pstepanov.dev");
    assert.deepEqual(delivered, [[replyMail[0].id]]);

    assert.equal((await handleAdminSupportGet(get("/api/admin/support?status=open", admin)).then((r) => r.json()) as { requests: unknown[] }).requests.length, 0);
    const closed = await handleAdminSupportPatch(patch("/api/admin/support", { id, status: "closed" }, admin));
    assert.equal(closed.status, 200);
    assert.equal(((await closed.json()) as { request: { status: string } }).request.status, "closed");
    assert.equal((await handleAdminSupportPatch(patch("/api/admin/support", { id: "doesnotexist00", status: "open" }, admin))).status, 404);
    assert.equal((await handleAdminSupportPatch(patch("/api/admin/support", { id, status: "spam" }, admin))).status, 400);
    assert.equal((await handleAdminSupportReply(post("/api/admin/support", { id, message: "" }, admin))).status, 400);
  });
});

describe("friend codes: the dashboard contract", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("refuses without the admin secret", async () => {
    assert.equal((await handleAdminCodesGet(get("/api/admin/codes"))).status, 401);
    assert.equal((await handleAdminCodesPost(post("/api/admin/codes", { label: "x", durationDays: 7, maxRedemptions: 1, expiresAt: null }))).status, 401);
    assert.equal((await handleAdminCodesPatch(patch("/api/admin/codes", { action: "disable", codeId: "a".repeat(64) }))).status, 401);
  });

  it("creates, lists, disables, enables and revokes, in the shapes the dashboard reads", async () => {
    const created = await handleAdminCodesPost(post("/api/admin/codes", { label: "Beta", durationDays: 90, maxRedemptions: 3, expiresAt: null, createdBy: "owner@example.com" }, admin));
    assert.equal(created.status, 201);
    const { code } = (await created.json()) as { code: Record<string, unknown> };
    assert.match(code.code as string, /^CADENCE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(code.id, hashCode(code.code as string));
    for (const key of ["id", "code", "label", "durationDays", "maxRedemptions", "redemptions", "expiresAt", "disabled", "createdAt", "createdBy", "redemptionList"]) {
      assert.ok(key in code, key);
    }
    assert.equal(code.createdBy, "owner@example.com");

    const custom = await handleAdminCodesPost(post("/api/admin/codes", { label: "Launch", code: "launch-week", durationDays: 7, maxRedemptions: 1, expiresAt: Date.now() + DAY }, admin));
    assert.equal(custom.status, 201);
    const taken = await handleAdminCodesPost(post("/api/admin/codes", { label: "Again", code: "LAUNCH-WEEK", durationDays: 7, maxRedemptions: 1, expiresAt: null }, admin));
    assert.equal(taken.status, 409);
    assert.equal(((await taken.json()) as { error_description: string }).error_description, "That code already exists. Choose another.");
    const forever = await handleAdminCodesPost(post("/api/admin/codes", { label: "Forever", durationDays: null, maxRedemptions: 1, expiresAt: null }, admin));
    assert.equal(forever.status, 400, "no lifetime codes");
    const notJson = await handleAdminCodesPost(new Request(`${ORIGIN}/api/admin/codes`, { method: "POST", headers: admin, body: "x" }));
    assert.equal(notJson.status, 415);

    const { uid, idToken } = await signUp("friend@example.com");
    const redeemed = await handleRedeemPost(post("/api/codes/redeem", { code: (code.code as string).toLowerCase() }, { Authorization: `Bearer ${idToken}` }));
    assert.equal(redeemed.status, 200);

    const listed = (await (await handleAdminCodesGet(get("/api/admin/codes", admin))).json()) as { codes: { id: string; redemptions: number; redemptionList: { uid: string; email?: string; grantExpiresAt: number }[] }[] };
    assert.equal(listed.codes.length, 2);
    const beta = listed.codes.find((entry) => entry.id === code.id)!;
    assert.equal(beta.redemptions, 1);
    assert.equal(beta.redemptionList[0].uid, uid);
    assert.equal(beta.redemptionList[0].email, "friend@example.com");

    assert.deepEqual(await (await handleAdminCodesPatch(patch("/api/admin/codes", { action: "disable", codeId: code.id }, admin))).json(), { ok: true });
    assert.equal((await db().collection("friendCodes").doc(code.id as string).get()).data()?.disabled, true);
    assert.deepEqual(await (await handleAdminCodesPatch(patch("/api/admin/codes", { action: "enable", codeId: code.id }, admin))).json(), { ok: true });
    assert.equal((await handleAdminCodesPatch(patch("/api/admin/codes", { action: "disable", codeId: "f".repeat(64) }, admin))).status, 404);
    assert.equal((await handleAdminCodesPatch(patch("/api/admin/codes", { action: "explode", codeId: code.id }, admin))).status, 400);

    const revoked = (await (await handleAdminCodesPatch(patch("/api/admin/codes", { action: "revoke", codeId: code.id, uid }, admin))).json()) as Record<string, unknown>;
    assert.deepEqual(revoked, { ok: true, result: "revoked", grantDeleted: true });
    assert.equal(readAccount((await db().collection("users").doc(uid).get()).data()).isPlus, false, "revoking ends that code's Plus now");
    const again = (await (await handleAdminCodesPatch(patch("/api/admin/codes", { action: "revoke", codeId: code.id, uid }, admin))).json()) as Record<string, unknown>;
    assert.equal(again.result, "already_revoked");
    assert.equal((await handleAdminCodesPatch(patch("/api/admin/codes", { action: "revoke", codeId: code.id, uid: "nobody" }, admin))).status, 404);
  });
});

async function makeCode(over: Record<string, unknown> = {}) {
  const response = await handleAdminCodesPost(post("/api/admin/codes", { label: "Test", durationDays: 30, maxRedemptions: 1, expiresAt: null, ...over }, admin));
  return ((await response.json()) as { code: { id: string; code: string } }).code;
}

describe("redeeming a code", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("needs a signed-in account", async () => {
    assert.equal((await handleRedeemPost(post("/api/codes/redeem", { code: "CADENCE-AAAA-AAAA" }))).status, 401);
    assert.equal((await handleRedeemGet(get("/api/codes/redeem?code=CADENCE-AAAA-AAAA"))).status, 401);
  });

  it("previews without redeeming, then grants Plus through plusSources.code for the code's days", async () => {
    const code = await makeCode({ durationDays: 90 });
    const { uid, idToken } = await signUp();
    const auth = { Authorization: `Bearer ${idToken}` };

    const preview = await handleRedeemGet(get(`/api/codes/redeem?code=${encodeURIComponent(code.code)}`, auth));
    assert.deepEqual(await preview.json(), { durationDays: 90, duration: "3 months" });
    assert.equal((await db().collection("users").doc(uid).get()).exists, false, "a lookup writes nothing");

    const before = Date.now();
    const response = await handleRedeemPost(post("/api/codes/redeem", { code: code.code }, auth));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { redeemed: boolean; duration: string; expiresAt: number };
    assert.equal(body.redeemed, true);
    assert.equal(body.duration, "3 months");
    assert.ok(body.expiresAt >= before + 90 * DAY && body.expiresAt <= Date.now() + 90 * DAY);

    const data = (await db().collection("users").doc(uid).get()).data()!;
    assert.equal(data.plusSources.code.source, "code");
    assert.equal(data.plusSources.code.codeId, code.id);
    assert.equal(data.plusSources.code.willRenew, false);
    assert.equal(data.plus.source, "code");
    assert.equal(data.detailPurgeAt, body.expiresAt + 90 * DAY, "detail is purged 90 days after the code ends");
    assert.equal(readAccount(data).isPlus, true);
    assert.equal(readAccount(data, body.expiresAt).isPlus, false, "Plus ends with the code");

    const twice = await handleRedeemPost(post("/api/codes/redeem", { code: code.code }, auth));
    assert.equal(twice.status, 400);
    assert.equal(((await twice.json()) as { message: string }).message, "You've already redeemed this code.");
  });

  it("refuses used-up, disabled, expired and unknown codes in plain words", async () => {
    const single = await makeCode({ maxRedemptions: 1 });
    const first = await signUp();
    const second = await signUp();
    assert.equal((await redeemCode(first.uid, single.code)).ok, true);
    assert.deepEqual(await redeemCode(second.uid, single.code), { ok: false, reason: "exhausted" });

    const disabled = await makeCode({ maxRedemptions: 5 });
    await handleAdminCodesPatch(patch("/api/admin/codes", { action: "disable", codeId: disabled.id }, admin));
    assert.deepEqual(await redeemCode(second.uid, disabled.code), { ok: false, reason: "disabled" });

    const lastDay = await makeCode({ maxRedemptions: 5, expiresAt: Date.now() + DAY });
    assert.deepEqual(await redeemCode(second.uid, lastDay.code, { now: Date.now() + 2 * DAY }), { ok: false, reason: "expired" });
    assert.deepEqual(await redeemCode(second.uid, "CADENCE-ZZZZ-ZZZZ"), { ok: false, reason: "invalid" });
  });

  it("extends a running code grant and leaves a subscription alone", async () => {
    const { uid } = await signUp();
    const now = Date.now();
    await db().collection("users").doc(uid).set({ email: "x@example.com", plusSources: { stripe: plusRecord("stripe", now) }, plus: plusRecord("stripe", now) });
    const month = await makeCode({ durationDays: 30 });
    const year = await makeCode({ durationDays: 365 });

    const a = await redeemCode(uid, month.code, { now });
    const b = await redeemCode(uid, year.code, { now: now + 1000 });
    assert.ok(a.ok && b.ok);
    assert.equal(b.expiresAt, now + 1000 + 365 * DAY);

    const data = (await db().collection("users").doc(uid).get()).data()!;
    assert.equal(data.plusSources.stripe.source, "stripe", "the subscription record is untouched");
    assert.equal(data.plus.source, "code", "the longest active source wins");
    assert.equal(data.detailPurgeAt, undefined, "an active subscription means no purge is scheduled");

    // Revoking the first code leaves the grant the second one wrote.
    assert.deepEqual(await revokeRedemption(month.id, uid), { result: "revoked", grantDeleted: false });
    assert.equal(readAccount((await db().collection("users").doc(uid).get()).data()).plusSources.code?.active, true);
  });

  it("allows ten tries an hour per account", async () => {
    const { uid } = await signUp();
    for (let i = 0; i < 10; i += 1) assert.equal((await redeemCode(uid, `CADENCE-NOPE-${String(i).padStart(4, "2")}`)).ok, false);
    assert.deepEqual(await redeemCode(uid, "CADENCE-NOPE-ZZZZ"), { ok: false, reason: "rate_limited" });
  });

  it("allows thirty tries an hour per address, across accounts", async () => {
    const headers = { "x-forwarded-for": "198.51.100.9" };
    const accounts = await Promise.all([signUp(), signUp(), signUp(), signUp()]);
    let tries = 0;
    for (const { idToken } of accounts) {
      for (let i = 0; i < 8 && tries < 30; i += 1, tries += 1) {
        const response = await handleRedeemPost(post("/api/codes/redeem", { code: `CADENCE-NOPE-${String(tries).padStart(4, "2")}` }, { ...headers, Authorization: `Bearer ${idToken}` }));
        assert.equal(response.status, 400);
      }
    }
    const fresh = await signUp();
    const refused = await handleRedeemPost(post("/api/codes/redeem", { code: "CADENCE-NOPE-ZZZZ" }, { ...headers, Authorization: `Bearer ${fresh.idToken}` }));
    assert.equal(refused.status, 429);
  });

  it("removes redemptions with the account", async () => {
    const code = await makeCode({ maxRedemptions: 2 });
    const { uid } = await signUp();
    await redeemCode(uid, code.code, { email: "gone@example.com" });
    await deleteRedemptionsFor(uid);
    assert.equal((await db().collection("friendCodes").doc(code.id).collection("redemptions").get()).size, 0);
  });
});
