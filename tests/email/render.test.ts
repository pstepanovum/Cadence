// FILE: tests/email/render.test.ts
//
// Every email template renders from its fixture into an HTML and a plain-text
// part, with nothing left unreplaced, inline styles, alt text on every image,
// at most 560 px wide, under Gmail's 102 KB clip, an unsubscribe link exactly
// when the mail is opt-in, and hostile props escaped.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TEMPLATES, TEMPLATE_IDS, renderFixture, renderTemplate } from "../../src/lib/server/email/templates/index.ts";

describe("email templates", () => {
  for (const id of TEMPLATE_IDS) {
    it(`${id} renders a complete message`, () => {
      const email = renderFixture(id);
      const entry = TEMPLATES[id];
      assert.ok(email.subject.trim().length > 0 && email.subject.length <= 90, "subject");
      assert.ok(email.preheader.trim().length > 0, "preheader");
      assert.ok(email.html.startsWith("<!doctype html>"), "doctype");
      assert.ok(email.text.trim().length > 40, "plain text part");
      assert.equal(email.category, entry.category);
      for (const part of [email.html, email.text, email.subject]) {
        assert.doesNotMatch(part, /undefined|NaN|\[object Object\]|\$\{|\{\{(?! doubleoptin)/, "unreplaced value");
      }
      assert.ok(Buffer.byteLength(email.html) < 100 * 1024, "under 100 KB");
      for (const img of email.html.match(/<img\b[^>]*>/g) ?? []) assert.match(img, /\salt="[^"]+"/, "img alt");
      assert.match(email.html, /max-width:560px/);
      assert.equal((email.html.match(/<style>/g) ?? []).length, 1, "one head style block only");
      assert.equal((email.html.match(/<link /g) ?? []).length, 1, "one font link only");
      const hasUnsubscribe = /Unsubscribe/.test(email.html);
      assert.equal(hasUnsubscribe, entry.category !== "transactional", "unsubscribe only on opt-in mail");
      assert.match(email.text, /Questions\? Reply to this email/);
    });
  }

  it("escapes hostile props and refuses unsafe links", () => {
    const email = renderTemplate("mcp-authorized", { clientName: '<script>alert(1)</script>"', destination: "evil.example", scopes: ["cadence:read"], at: Date.UTC(2026, 0, 1) });
    assert.doesNotMatch(email.html, /<script>/);
    const reset = renderTemplate("password-reset", { email: "a@b.co", resetUrl: "javascript:alert(1)" });
    assert.doesNotMatch(reset.html, /javascript:/);
  });

  it("covers every template the brief names", () => {
    for (const id of [
      "welcome", "verify-email", "password-reset", "password-changed", "email-changed", "new-sign-in", "deletion-scheduled", "account-deleted", "data-export-ready",
      "plus-welcome", "trial-started", "trial-ending", "payment-receipt", "billing-issue", "plus-canceled", "plus-ended", "plan-changed", "refund-issued",
      "mcp-authorized", "device-paired", "suspicious-activity",
      "streak-at-risk", "weekly-summary", "badge-earned", "inactive-nudge", "newsletter-confirm", "newsletter-welcome",
    ]) {
      assert.ok(TEMPLATE_IDS.includes(id as never), id);
    }
  });
});
