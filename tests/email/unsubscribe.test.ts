// FILE: tests/email/unsubscribe.test.ts
//
// Verified unsubscribe: signed tokens (round trip, tampering, wrong or missing
// secret), the GET page that only asks, RFC 8058 one-click POST, the page's
// own POST, already-unsubscribed, per-category consent, and the test subject
// that unsubscribes no one. Runs against a fake store, never Firestore.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { brevoPayload } from "../../src/lib/server/email/brevo.ts";
import { renderFixture } from "../../src/lib/server/email/templates/index.ts";
import { handleUnsubscribeGet, handleUnsubscribePost, type UnsubscribeClaim, type UnsubscribeStore } from "../../src/lib/server/email/unsubscribe-handler.ts";
import { TEST_UNSUBSCRIBE_SUBJECT, unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "../../src/lib/server/email/unsubscribe.ts";

const env = { EMAIL_UNSUBSCRIBE_SECRET: "a-test-secret-that-is-long-enough-0123456789" };
const ORIGIN = "http://localhost:3000";

/** A store with per-list sets of who is off, and a log of every write. */
function fakeStore(initial: Partial<Record<UnsubscribeClaim["list"], string[]>> = {}) {
  const off = { reminders: new Set(initial.reminders ?? []), lifecycle: new Set(initial.lifecycle ?? []), newsletter: new Set(initial.newsletter ?? []) };
  const writes: UnsubscribeClaim[] = [];
  const store: UnsubscribeStore = {
    async isUnsubscribed(claim) {
      return off[claim.list].has(claim.subject);
    },
    async unsubscribe(claim) {
      writes.push(claim);
      off[claim.list].add(claim.subject);
    },
  };
  return { store, off, writes };
}

const oneClick = (url: string) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
const fromPage = (url: string) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "source=page" });

describe("unsubscribe tokens", () => {
  it("round-trips every list", () => {
    for (const list of ["reminders", "lifecycle", "newsletter"] as const) {
      const subject = list === "newsletter" ? "maria@example.com" : "uid_123";
      assert.deepEqual(verifyUnsubscribeToken(unsubscribeToken(subject, list, env), env), { list, subject });
    }
  });

  it("refuses a tampered payload, a tampered signature, another secret, and junk", () => {
    const token = unsubscribeToken("uid_123", "lifecycle", env);
    const [payload, signature] = token.split(".");
    const otherPayload = Buffer.from("v1:lifecycle:uid_999").toString("base64url");
    assert.equal(verifyUnsubscribeToken(`${otherPayload}.${signature}`, env), null);
    const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    assert.equal(verifyUnsubscribeToken(`${payload}.${flipped}`, env), null);
    assert.equal(verifyUnsubscribeToken(token, { EMAIL_UNSUBSCRIBE_SECRET: "another-secret-that-is-also-long-enough-xyz" }), null);
    assert.equal(verifyUnsubscribeToken(`${token}.extra`, env), null);
    assert.equal(verifyUnsubscribeToken("", env), null);
    assert.equal(verifyUnsubscribeToken(null, env), null);
  });

  it("cannot be made or checked without the secret", () => {
    assert.throws(() => unsubscribeToken("uid_123", "lifecycle", {}));
    assert.throws(() => unsubscribeToken("uid_123", "lifecycle", { EMAIL_UNSUBSCRIBE_SECRET: "short" }));
  });

  it("is unguessable: different subjects and lists sign differently", () => {
    const a = unsubscribeToken("uid_1", "lifecycle", env);
    assert.notEqual(a, unsubscribeToken("uid_2", "lifecycle", env));
    assert.notEqual(a, unsubscribeToken("uid_1", "reminders", env));
    assert.ok(a.split(".")[1].length >= 43, "a full SHA-256 signature");
  });
});

describe("GET /api/email/unsubscribe", () => {
  it("asks first and changes nothing", async () => {
    const { store, writes } = fakeStore();
    const response = await handleUnsubscribeGet(unsubscribeUrl("uid_123", "lifecycle", ORIGIN, env), { store, env });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Unsubscribe from getting-started tips\?/);
    assert.match(html, /<form method="post" action="\/api\/email\/unsubscribe\?token=/);
    assert.match(html, /name="source" value="page"/);
    assert.equal(writes.length, 0);
  });

  it("says so when the address is already off that list", async () => {
    const { store, writes } = fakeStore({ lifecycle: ["uid_123"] });
    const response = await handleUnsubscribeGet(unsubscribeUrl("uid_123", "lifecycle", ORIGIN, env), { store, env });
    assert.match(await response.text(), /already unsubscribed/);
    assert.equal(writes.length, 0);
  });

  it("answers 400 to a tampered token", async () => {
    const { store, writes } = fakeStore();
    const url = unsubscribeUrl("uid_123", "lifecycle", ORIGIN, env).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    const response = await handleUnsubscribeGet(url, { store, env });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Link not recognised/);
    assert.equal(writes.length, 0);
  });

  it("answers 400 when the server has no secret", async () => {
    const { store } = fakeStore();
    const response = await handleUnsubscribeGet(unsubscribeUrl("uid_123", "lifecycle", ORIGIN, env), { store, env: {} });
    assert.equal(response.status, 400);
  });
});

describe("POST /api/email/unsubscribe", () => {
  it("one-click turns off exactly that list and answers with a status", async () => {
    const { store, off, writes } = fakeStore();
    const response = await handleUnsubscribePost(oneClick(unsubscribeUrl("uid_123", "lifecycle", ORIGIN, env)), { store, env });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
    assert.deepEqual(writes, [{ list: "lifecycle", subject: "uid_123" }]);
    assert.ok(off.lifecycle.has("uid_123"));
    assert.equal(off.reminders.size + off.newsletter.size, 0, "other categories untouched");
  });

  it("from the page's button, answers with a page", async () => {
    const { store, writes } = fakeStore();
    const response = await handleUnsubscribePost(fromPage(unsubscribeUrl("maria@example.com", "newsletter", ORIGIN, env)), { store, env });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /You&#39;re unsubscribed[\s\S]*product news and offers/);
    assert.deepEqual(writes, [{ list: "newsletter", subject: "maria@example.com" }]);
  });

  it("does not write twice for someone already unsubscribed", async () => {
    const { store, writes } = fakeStore({ reminders: ["uid_123"] });
    const response = await handleUnsubscribePost(fromPage(unsubscribeUrl("uid_123", "reminders", ORIGIN, env)), { store, env });
    assert.match(await response.text(), /already unsubscribed/);
    assert.equal(writes.length, 0);
    const again = await handleUnsubscribePost(oneClick(unsubscribeUrl("uid_123", "reminders", ORIGIN, env)), { store, env });
    assert.equal(again.status, 200);
    assert.equal(writes.length, 0);
  });

  it("refuses a tampered token without writing", async () => {
    const { store, writes } = fakeStore();
    const forged = `${ORIGIN}/api/email/unsubscribe?token=${Buffer.from("v1:lifecycle:uid_victim").toString("base64url")}.forged`;
    assert.equal((await handleUnsubscribePost(oneClick(forged), { store, env })).status, 400);
    assert.equal((await handleUnsubscribePost(fromPage(forged), { store, env })).status, 400);
    assert.equal(writes.length, 0);
  });

  it("the test subject's link works and unsubscribes no one", async () => {
    const { store, writes } = fakeStore();
    const url = unsubscribeUrl(TEST_UNSUBSCRIBE_SUBJECT, "lifecycle", ORIGIN, env);
    assert.equal((await handleUnsubscribeGet(url, { store, env })).status, 200);
    assert.equal((await handleUnsubscribePost(oneClick(url), { store, env })).status, 200);
    assert.match(await (await handleUnsubscribePost(fromPage(url), { store, env })).text(), /You&#39;re unsubscribed/);
    assert.equal(writes.length, 0);
  });

  it("answers 503 when the store fails, so mail clients retry", async () => {
    const store: UnsubscribeStore = { isUnsubscribed: async () => false, unsubscribe: async () => { throw new Error("down"); } };
    const response = await handleUnsubscribePost(oneClick(unsubscribeUrl("uid_123", "lifecycle", ORIGIN, env)), { store, env });
    assert.equal(response.status, 503);
  });
});

describe("unsubscribe headers on the wire", () => {
  it("non-transactional mail carries List-Unsubscribe and RFC 8058 List-Unsubscribe-Post", () => {
    const link = unsubscribeUrl("uid_123", "lifecycle", "https://cadence.pstepanov.dev", env);
    const payload = brevoPayload({ to: { email: "maria@example.com" }, email: renderFixture("lifecycle-start"), unsubscribeUrl: link }, {});
    assert.equal(payload.headers?.["List-Unsubscribe"], `<${link}>`);
    assert.equal(payload.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  it("transactional mail carries none, and non-transactional mail without a link is refused", () => {
    const payload = brevoPayload({ to: { email: "maria@example.com" }, email: renderFixture("welcome") }, {});
    assert.equal(payload.headers?.["List-Unsubscribe"], undefined);
    assert.throws(() => brevoPayload({ to: { email: "maria@example.com" }, email: renderFixture("sale-offer") }, {}));
  });
});
