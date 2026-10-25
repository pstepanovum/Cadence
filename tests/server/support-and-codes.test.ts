// FILE: tests/server/support-and-codes.test.ts
//
// The pure parts of support requests and friend codes: form validation, the
// admin secret, the support emails, and the code rules (normalizing, limits,
// durations, failures, how a redemption extends a grant).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkReply, checkSupportRequest, SUPPORT_LIMITS } from "../../src/lib/support-request.ts";
import { isAdminAuthorized } from "../../src/lib/server/admin-auth.ts";
import { brevoPayload } from "../../src/lib/server/email/brevo.ts";
import { supportInbox } from "../../src/lib/server/email/senders.ts";
import { renderTemplate } from "../../src/lib/server/email/templates/index.ts";
import {
  CODE_LIMITS,
  DAY_MS,
  describeGrantDuration,
  extendedGrantExpiry,
  generateCode,
  hashCode,
  isWellFormedCode,
  normalizeCode,
  parseCreateCodeInput,
  parseFriendCode,
  parseStoredCode,
  redeemFailure,
  redeemFailureMessage,
  type FriendCode,
} from "../../src/lib/server/codes/logic.ts";

const NOW = Date.UTC(2026, 9, 24, 12);

describe("support request validation", () => {
  const good = { email: " Maria@Example.com ", topic: "help", message: "The TH score never moves past 60.", name: "Maria\nLopez" };

  it("accepts a complete request and cleans it", () => {
    const checked = checkSupportRequest({ ...good, platform: "web", extra: "ignored" });
    assert.ok(checked.ok);
    assert.deepEqual(checked.request, { email: "maria@example.com", topic: "help", message: "The TH score never moves past 60.", name: "Maria Lopez", platform: "web" });
  });

  it("names the field that is wrong", () => {
    const field = (input: unknown) => {
      const checked = checkSupportRequest(input);
      return checked.ok ? null : checked.field;
    };
    assert.equal(field({ ...good, email: "not-an-address" }), "email");
    assert.equal(field({ ...good, topic: "spam" }), "topic");
    assert.equal(field({ ...good, message: "short" }), "message");
    assert.equal(field({ ...good, message: "x".repeat(SUPPORT_LIMITS.message + 1) }), "message");
    assert.equal(field(null), "email");
  });

  it("drops invisible characters and unknown platforms", () => {
    const checked = checkSupportRequest({ ...good, message: "Hello\u0000 there‮, my score is stuck.", platform: "android" });
    assert.ok(checked.ok);
    assert.equal(checked.request.message, "Hello there, my score is stuck.");
    assert.equal(checked.request.platform, undefined);
  });

  it("checks a reply", () => {
    assert.deepEqual(checkReply("  Thanks, fixed now. "), { ok: true, message: "Thanks, fixed now." });
    assert.equal(checkReply("").ok, false);
    assert.equal(checkReply(42).ok, false);
    assert.equal(checkReply("x".repeat(9000)).ok, false);
  });
});

describe("admin secret", () => {
  const env = { ADMIN_SECRET: "s".repeat(40) };
  it("accepts only the exact bearer secret", () => {
    assert.equal(isAdminAuthorized(`Bearer ${"s".repeat(40)}`, env), true);
    assert.equal(isAdminAuthorized(`bearer ${"s".repeat(40)}`, env), true);
    assert.equal(isAdminAuthorized(`Bearer ${"s".repeat(39)}`, env), false);
    assert.equal(isAdminAuthorized(null, env), false);
    assert.equal(isAdminAuthorized("Basic abc", env), false);
  });
  it("refuses everything when the secret is unset or short", () => {
    assert.equal(isAdminAuthorized("Bearer short", { ADMIN_SECRET: "short" }), false);
    assert.equal(isAdminAuthorized("Bearer ", {}), false);
  });
});

describe("support email", () => {
  it("goes to the inbox with the writer as reply-to, and keeps their words out of the subject", () => {
    const email = renderTemplate("support-request", { requestId: "abc123", topic: "billing", email: "maria@example.com", name: "Maria", message: "Subject: injected\r\nBcc: x@y.z\n\nSecond paragraph <b>bold</b>", at: NOW });
    assert.equal(email.subject, "Support: Cadence Plus or billing");
    assert.doesNotMatch(email.html, /<b>bold<\/b>/);
    const payload = brevoPayload({ to: supportInbox({}), email, replyTo: { email: "maria@example.com", name: "Maria\r\nBcc: x" } }, {});
    assert.deepEqual(payload.to, [{ email: "support@cadence.pstepanov.dev", name: "Cadence support" }]);
    assert.equal(payload.replyTo.email, "maria@example.com");
    assert.doesNotMatch(payload.replyTo.name ?? "", /[\r\n]/);
  });

  it("a reply goes out with the support inbox as reply-to", () => {
    const email = renderTemplate("support-reply", { name: "Maria Lopez", topic: "help", message: "Try the compare view.", original: "My score is stuck." });
    assert.equal(email.subject, "Re: Something isn't working");
    assert.match(email.text, /Hi Maria,/);
    const payload = brevoPayload({ to: { email: "maria@example.com" }, email, replyTo: supportInbox({}) }, {});
    assert.equal(payload.replyTo.email, "support@cadence.pstepanov.dev");
  });

  it("SUPPORT_INBOX overrides the inbox", () => {
    assert.equal(supportInbox({ SUPPORT_INBOX: "Owner <owner@example.com>" }).email, "owner@example.com");
  });
});

const code = (over: Partial<FriendCode> = {}): FriendCode => ({
  code: "CADENCE-ABCD-EFGH",
  codeHash: hashCode("CADENCE-ABCD-EFGH"),
  label: "Friends",
  durationDays: 30,
  maxRedemptions: 2,
  redemptions: 0,
  expiresAt: null,
  disabled: false,
  createdAt: NOW,
  createdBy: "owner",
  ...over,
});

describe("friend code rules", () => {
  it("normalizes what people type", () => {
    assert.equal(normalizeCode(" cadence–abcd efgh "), "CADENCE-ABCDEFGH");
    assert.equal(normalizeCode("cadence-abcd-efgh"), "CADENCE-ABCD-EFGH");
    assert.equal(normalizeCode(42), "");
    assert.equal(isWellFormedCode("CADENCE-ABCD-EFGH"), true);
    assert.equal(isWellFormedCode("AB"), false);
    assert.equal(isWellFormedCode("CADENCE--X"), false);
    assert.equal(isWellFormedCode("A".repeat(CODE_LIMITS.maxLength + 1)), false);
  });

  it("generates readable, prefixed codes", () => {
    const generated = generateCode();
    assert.match(generated, /^CADENCE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(isWellFormedCode(generated), true);
    assert.equal(hashCode(generated), hashCode(normalizeCode(generated.toLowerCase())));
  });

  it("describes durations like the dashboard", () => {
    assert.equal(describeGrantDuration(7), "7 days");
    assert.equal(describeGrantDuration(30), "1 month");
    assert.equal(describeGrantDuration(90), "3 months");
    assert.equal(describeGrantDuration(365), "1 year");
    assert.equal(describeGrantDuration(1), "1 day");
  });

  it("never accepts a code without an end", () => {
    const base = { label: "Beta", durationDays: 90, maxRedemptions: 5, expiresAt: null };
    assert.deepEqual(parseCreateCodeInput(base, NOW), { ...base, code: undefined });
    assert.equal(typeof parseCreateCodeInput({ ...base, durationDays: null }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, durationDays: 0 }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, durationDays: 731 }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, durationDays: 1.5 }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, maxRedemptions: 0 }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, expiresAt: NOW - 1 }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, label: "" }, NOW), "string");
    assert.equal(typeof parseCreateCodeInput({ ...base, code: "no spaces?" }, NOW), "string");
    assert.equal((parseCreateCodeInput({ ...base, code: "launch-week" }, NOW) as { code: string }).code, "LAUNCH-WEEK");
    assert.equal(parseFriendCode({ ...code(), durationDays: null }), null, "an open-ended stored code is not redeemable");
    assert.equal(parseStoredCode({ ...code(), durationDays: null })?.durationDays, 0, "but still listed");
  });

  it("says why a code cannot be redeemed", () => {
    assert.equal(redeemFailure(null, false, NOW), "invalid");
    assert.equal(redeemFailure(code({ disabled: true }), false, NOW), "disabled");
    assert.equal(redeemFailure(code({ expiresAt: NOW }), false, NOW), "expired");
    assert.equal(redeemFailure(code(), true, NOW), "already_redeemed");
    assert.equal(redeemFailure(code({ redemptions: 2 }), false, NOW), "exhausted");
    assert.equal(redeemFailure(code(), false, NOW), null);
    assert.match(redeemFailureMessage("exhausted"), /used up/);
  });

  it("extends a running grant and never shortens it", () => {
    assert.equal(extendedGrantExpiry(null, 30, NOW), NOW + 30 * DAY_MS);
    assert.equal(extendedGrantExpiry({ active: true, expiresAt: NOW + 100 * DAY_MS }, 30, NOW), NOW + 100 * DAY_MS);
    assert.equal(extendedGrantExpiry({ active: true, expiresAt: NOW + 10 * DAY_MS }, 30, NOW), NOW + 30 * DAY_MS);
    assert.equal(extendedGrantExpiry({ active: false, expiresAt: NOW + 100 * DAY_MS }, 30, NOW), NOW + 30 * DAY_MS, "a revoked grant does not count");
    assert.equal(extendedGrantExpiry({ active: true, expiresAt: NOW - DAY_MS }, 7, NOW), NOW + 7 * DAY_MS);
  });
});

describe("a code grant is one more Plus source", () => {
  it("resolves with the purchases and runs out on time", async () => {
    const { hasPlus, resolvePlus } = await import("../../src/lib/platform/engine-routing.ts");
    const { readAccount } = await import("../../src/lib/server/entitlement.ts");
    const grant = { active: true, source: "code" as const, productId: "dev.pstepanov.cadence.plus.code", expiresAt: NOW + 30 * DAY_MS, willRenew: false, updatedAt: NOW, eventAt: NOW, codeId: "c".repeat(64) };
    const lapsed = { active: false, source: "stripe" as const, productId: "dev.pstepanov.cadence.plus.monthly", expiresAt: NOW - DAY_MS, willRenew: false, updatedAt: NOW - DAY_MS };
    const plus = resolvePlus({ stripe: lapsed, code: grant }, NOW);
    assert.equal(plus?.source, "code");
    assert.equal(hasPlus(plus, NOW), true);
    assert.equal(hasPlus(plus, NOW + 30 * DAY_MS), false, "ends at its expiry, exclusive");

    const account = readAccount({ plusSources: { code: grant }, plus }, NOW);
    assert.equal(account.isPlus, true);
    assert.equal(account.plusSources.code?.codeId, "c".repeat(64));
    assert.equal(readAccount({ plusSources: { code: grant }, plus }, NOW + 31 * DAY_MS).isPlus, false);
  });
});
