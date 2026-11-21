// FILE: tests/server/emulator/password-reset.test.ts
//
// Cadence's own password reset against the Auth and Firestore emulators:
// only a hash is stored, a new link turns the older ones off, links expire
// and work once, a wrong or weak attempt changes nothing, and a good one sets
// the password, marks the address verified and signs every session out.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { clearAuth, clearFirestore, signUp, skip } from "./helpers.ts";
import { auth, db } from "../../../src/lib/server/firebase.ts";
import { RESET_COLLECTION, RESET_TTL_MS, checkPasswordReset, completePasswordReset, hashResetToken, issuePasswordReset, purgeExpiredResets } from "../../../src/lib/server/password-reset.ts";

const NEW_PASSWORD = "brand new 4 words";

async function signInWorks(email: string, password: string): Promise<boolean> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return response.ok;
}

async function issueToken(email: string, now = Date.now()): Promise<string> {
  const plan = await issuePasswordReset(email, { now });
  assert.equal(plan.kind, "password");
  return (plan as { token: string }).token;
}

describe("password reset", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await clearAuth();
  });

  it("stores only the hash, for 60 minutes, and shows a masked address", async () => {
    const { email, uid } = await signUp();
    const now = Date.now();
    const token = await issueToken(email, now);
    const docs = await db().collection(RESET_COLLECTION).get();
    assert.equal(docs.size, 1);
    assert.equal(docs.docs[0].id, hashResetToken(token));
    assert.ok(!JSON.stringify(docs.docs[0].data()).includes(token), "the token itself is stored nowhere");
    assert.equal(docs.docs[0].data().uid, uid);
    assert.equal(docs.docs[0].data().expiresAt, now + RESET_TTL_MS);
    const state = await checkPasswordReset(token, { now });
    assert.equal(state.state, "valid");
    assert.match((state as { email: string }).email, /^.\*\*\*@example\.com$/);
  });

  it("writes nothing for an unknown address", async () => {
    assert.deepEqual(await issuePasswordReset("nobody@example.com"), { kind: "none" });
    assert.equal((await db().collection(RESET_COLLECTION).get()).size, 0);
  });

  it("turns older links off when a new one is sent", async () => {
    const { email } = await signUp();
    const first = await issueToken(email);
    const second = await issueToken(email);
    assert.equal((await checkPasswordReset(first)).state, "used");
    assert.equal((await checkPasswordReset(second)).state, "valid");
    assert.deepEqual(await completePasswordReset(first, NEW_PASSWORD), { ok: false, reason: "used" });
  });

  it("expires after 60 minutes", async () => {
    const { email } = await signUp();
    const now = Date.now();
    const token = await issueToken(email, now);
    assert.equal((await checkPasswordReset(token, { now: now + RESET_TTL_MS + 1 })).state, "expired");
    assert.deepEqual(await completePasswordReset(token, NEW_PASSWORD, { now: now + RESET_TTL_MS + 1 }), { ok: false, reason: "expired" });
  });

  it("refuses a wrong token and a weak password without using the link", async () => {
    const { email } = await signUp();
    const token = await issueToken(email);
    const wrong = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    assert.deepEqual(await completePasswordReset(wrong, NEW_PASSWORD), { ok: false, reason: "invalid" });
    assert.deepEqual(await completePasswordReset("junk", NEW_PASSWORD), { ok: false, reason: "invalid" });
    assert.deepEqual(await completePasswordReset(token, "short"), { ok: false, reason: "weak_password" });
    assert.deepEqual(await completePasswordReset(token, `${email.split("@")[0]}123`), { ok: false, reason: "weak_password" }, "not the email address");
    assert.equal((await checkPasswordReset(token)).state, "valid", "still usable");
  });

  it("sets the password, verifies the address, signs every session out, and works once", async () => {
    const { email, uid } = await signUp();
    const before = await auth().getUser(uid);
    assert.equal(before.emailVerified, false);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // tokensValidAfter has one-second resolution
    const token = await issueToken(email);

    const result = await completePasswordReset(token, NEW_PASSWORD);
    assert.equal(result.ok, true);
    const after = await auth().getUser(uid);
    assert.equal(after.emailVerified, true, "finishing a reset proves the address");
    assert.ok(Date.parse(after.tokensValidAfterTime ?? "0") > Date.parse(before.tokensValidAfterTime ?? "0"), "refresh tokens revoked");
    assert.equal(await signInWorks(email, NEW_PASSWORD), true);
    assert.equal(await signInWorks(email, "correct horse battery"), false, "the old password is gone");

    assert.equal((await checkPasswordReset(token)).state, "used");
    assert.deepEqual(await completePasswordReset(token, "another 5 words"), { ok: false, reason: "used" });
  });

  it("lets only one of two simultaneous attempts through", async () => {
    const { email } = await signUp();
    const token = await issueToken(email);
    const results = await Promise.all([completePasswordReset(token, NEW_PASSWORD), completePasswordReset(token, "another 5 words")]);
    assert.equal(results.filter((r) => r.ok).length, 1);
  });

  it("the daily cleanup drops records a day past expiry", async () => {
    const { email } = await signUp();
    const long = Date.now() - 3 * 86_400_000;
    await issueToken(email, long);
    const fresh = await issueToken(email);
    assert.equal(await purgeExpiredResets(), 1);
    assert.equal((await db().collection(RESET_COLLECTION).get()).docs[0].id, hashResetToken(fresh));
  });
});
