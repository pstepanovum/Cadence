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

describe("emailing a code from the dashboard", () => {
  it("checks the request", async () => {
    const { parseCodeEmailInput } = await import("../../src/lib/server/codes/logic.ts");
    assert.deepEqual(parseCodeEmailInput({ code: " cadence–abcd efgh ", to: " maria@example.com ", name: "  Maria\n<Lopez>\u200b ", dryRun: true }), {
      code: "CADENCE-ABCDEFGH",
      to: "maria@example.com",
      name: "Maria Lopez",
      dryRun: true,
    });
    assert.deepEqual(parseCodeEmailInput({ code: "CADENCE-ABCD", to: "a@b.co" }), { code: "CADENCE-ABCD", to: "a@b.co", dryRun: false });
    assert.equal((parseCodeEmailInput({ code: "CADENCE-ABCD", to: "a@b.co", name: "x".repeat(90) }) as { name: string }).name.length, 60);
    for (const bad of [null, { to: "a@b.co" }, { code: "CADENCE-ABCD" }, { code: "CADENCE-ABCD", to: "a@b.co, c@d.co" }, { code: "CADENCE-ABCD", to: "not an address" }, { code: "CADENCE-ABCD", to: "a@b.co", dryRun: "yes" }, { code: "CADENCE-ABCD", to: "a@b.co", name: 4 }]) {
      assert.equal(typeof parseCodeEmailInput(bad as Record<string, unknown> | null), "string", JSON.stringify(bad));
    }
  });

  it("refuses codes that would not work", async () => {
    const { codeUnusableReason, codeUnusableMessage } = await import("../../src/lib/server/codes/logic.ts");
    const stored: FriendCode = { code: "CADENCE-ABCD", codeHash: "h", label: "x", durationDays: 30, maxRedemptions: 2, redemptions: 0, expiresAt: null, disabled: false, createdAt: NOW, createdBy: "owner" };
    assert.equal(codeUnusableReason(stored, NOW), null);
    assert.equal(codeUnusableReason({ ...stored, disabled: true }, NOW), "disabled");
    assert.equal(codeUnusableReason({ ...stored, expiresAt: NOW }, NOW), "expired");
    assert.equal(codeUnusableReason({ ...stored, redemptions: 2 }, NOW), "exhausted");
    assert.equal(codeUnusableReason({ ...stored, durationDays: 0 }, NOW), "no_duration");
    assert.match(codeUnusableMessage("exhausted"), /used up/);
  });

  it("remembers who it went to, newest last, capped", async () => {
    const { appendEmailedTo, parseEmailedTo } = await import("../../src/lib/server/codes/logic.ts");
    assert.deepEqual(appendEmailedTo(undefined, { to: "a@b.co", at: 1 }), [{ to: "a@b.co", at: 1 }]);
    assert.deepEqual(parseEmailedTo([{ to: "a@b.co", at: 1 }, { to: 3 }, null, "x", { to: "c@d.co", at: Number.NaN }]), [{ to: "a@b.co", at: 1 }]);
    const full = Array.from({ length: 200 }, (_, index) => ({ to: `p${index}@b.co`, at: index }));
    const next = appendEmailedTo(full, { to: "new@b.co", at: 999 });
    assert.equal(next.length, 200);
    assert.deepEqual(next[0], { to: "p1@b.co", at: 1 });
    assert.deepEqual(next[199], { to: "new@b.co", at: 999 });
  });

  it("renders a short gift from Pavel with the code, the redeem link and the date", async () => {
    const { giftDuration, redeemUrl } = await import("../../src/lib/server/email/templates/codes.ts");
    assert.equal(giftDuration(7), "7 days");
    assert.equal(giftDuration(30), "1 month");
    assert.equal(giftDuration(90), "3 months");
    assert.equal(giftDuration(180), "6 months");
    assert.equal(giftDuration(365), "12 months");
    assert.equal(giftDuration(45), "45 days");
    assert.equal(redeemUrl("CADENCE-ABCD-EFGH"), "https://cadence.pstepanov.dev/redeem?code=CADENCE-ABCD-EFGH");

    const email = renderTemplate("code-gift", { code: "CADENCE-ABCD-EFGH", durationDays: 90, expiresAt: Date.UTC(2026, 11, 31, 23), name: "Maria <Lopez>" });
    assert.equal(email.subject, "A gift: 3 months of Cadence Plus");
    assert.equal(email.preheader, "Use CADENCE-ABCD-EFGH by 31 December 2026.");
    assert.equal(email.category, "transactional");
    assert.match(email.html, /Pavel sent you 3 months of Cadence Plus/);
    assert.match(email.html, /Hi Maria,/);
    assert.match(email.html, /class="c-ticket"/);
    assert.match(email.html, /icons\/gift\.png/);
    assert.match(email.html, />CADENCE-ABCD-EFGH</);
    assert.match(email.html, /href="https:\/\/cadence\.pstepanov\.dev\/redeem\?code=CADENCE-ABCD-EFGH"/);
    assert.match(email.html, /by 31 December 2026/);
    assert.match(email.text, /Your code: CADENCE-ABCD-EFGH/);
    assert.match(email.text, /Redeem: https:\/\/cadence\.pstepanov\.dev\/redeem\?code=CADENCE-ABCD-EFGH/);
    for (const part of [email.html, email.text]) {
      assert.doesNotMatch(part, /iPhone|iOS|Android|App Store|in the app/i, "redeemed on the website only");
      assert.doesNotMatch(part, /Unsubscribe/);
    }

    const open = renderTemplate("code-gift", { code: "CADENCE-ABCD-EFGH", durationDays: 7, expiresAt: null });
    assert.equal(open.subject, "A gift: 7 days of Cadence Plus");
    assert.equal(open.preheader, "Use CADENCE-ABCD-EFGH on cadence.pstepanov.dev.");
    assert.match(open.html, /Hi,/);
    assert.doesNotMatch(open.html, / by \d/);
  });
});
