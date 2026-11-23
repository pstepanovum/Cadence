// FILE: tests/email/render.test.ts
//
// Every email template renders from its fixture into an HTML and a plain-text
// part, with nothing left unreplaced, inline styles, alt text on every image,
// at most 600 px wide, under Gmail's 102 KB clip, an unsubscribe link exactly
// when the mail is opt-in, and hostile props escaped.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { EMAIL_ICONS, POSTAL_ADDRESS, postalAddress } from "../../src/lib/server/email/layout.ts";
import { TEMPLATES, TEMPLATE_IDS, renderFixture, renderTemplate } from "../../src/lib/server/email/templates/index.ts";

const PUBLIC_EMAIL = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "email");

describe("email templates", () => {
  it("has a light and a dark PNG for every icon mail may use", () => {
    for (const name of EMAIL_ICONS) {
      assert.ok(existsSync(join(PUBLIC_EMAIL, "icons", `${name}.png`)), name);
      assert.ok(existsSync(join(PUBLIC_EMAIL, "icons", `${name}-dark.png`)), `${name}-dark`);
    }
  });

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
      for (const img of email.html.match(/<img\b[^>]*>/g) ?? []) {
        // Decorative icons carry an empty alt and role="presentation"; every other image says what it is.
        assert.match(img, /\salt="[^"]*"/, "img alt");
        if (/\salt=""/.test(img)) assert.match(img, /role="presentation"/, "empty alt only on decorative icons");
        // Every image is one Cadence hosts with its email assets, and exists in public/email.
        const src = /\ssrc="https:\/\/cadence\.pstepanov\.dev\/email\/([^"]+)"/.exec(img)?.[1];
        assert.ok(src, `image not from the email assets: ${img.slice(0, 80)}`);
        assert.ok(existsSync(join(PUBLIC_EMAIL, src)), `missing public/email/${src}`);
      }
      assert.match(email.html, /max-width:600px/);
      assert.doesNotMatch(email.html, /c-band|c-offer/, "no colour bands or blocks");
      // No uppercase styling or wide tracking anywhere; tight negative tracking on big type is fine.
      assert.doesNotMatch(email.html, /text-transform:\s*uppercase/i, "no uppercase styling");
      assert.doesNotMatch(email.html, /letter-spacing:\s*[0-9.]*[1-9]/, "no positive letter-spacing");
      // A friend code is printed as it is typed, in capitals; only the code itself is let through.
      const code = (entry.fixture as { code?: unknown }).code;
      const visible = email.html.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<[^>]+>/g, " ").replaceAll(typeof code === "string" ? code : "\u0000", " ");
      const shouted = (visible.match(/\b[A-Z]{4,}\b/g) ?? []).filter((word) => word !== "CADENCEHALF" && word !== "JSON" && word !== "PREVIEW");
      assert.deepEqual(shouted, [], "no words set in capitals");
      // White page and cards, gray panels and hairlines; the only colour fill is hunter green (the button and bullet squares).
      const fills = new Set((email.html.match(/bgcolor="(#[0-9A-Fa-f]{6})"/g) ?? []).map((m) => m.slice(9, 16).toUpperCase()));
      for (const fill of fills) assert.ok(["#FFFFFF", "#F4F5F6", "#E3E6E9", "#386641"].includes(fill), `unexpected fill ${fill}`);
      assert.match(email.html, /class="c-text c-headline"/, "headline");
      assert.doesNotMatch(email.subject, /\p{Extended_Pictographic}/u, "no emoji in the subject");
      assert.equal((email.html.match(/<style>/g) ?? []).length, 1, "one head style block only");
      assert.equal((email.html.match(/<link /g) ?? []).length, 1, "one font link only");
      const hasUnsubscribe = /Unsubscribe/.test(email.html);
      assert.equal(hasUnsubscribe, entry.category !== "transactional", "unsubscribe only on opt-in mail");
      assert.equal((email.html.match(/email\/app-icon\.png" width="36" height="36" alt="Cadence"/g) ?? []).length, 2, "App Store icon at the top and in the footer");
      assert.ok(email.html.includes(postalAddress()), "postal address in the html footer");
      assert.ok(email.text.trimEnd().endsWith(postalAddress()), "postal address closes the text footer");
    });
  }

  it("prints the postal address in marketing mail, with the env override kept", () => {
    const sale = renderFixture("sale-offer");
    assert.equal(TEMPLATES["sale-offer"].category, "marketing");
    assert.ok(sale.html.includes(POSTAL_ADDRESS) && sale.text.includes(POSTAL_ADDRESS));
    assert.equal(postalAddress({}), POSTAL_ADDRESS);
    assert.equal(postalAddress({ CADENCE_POSTAL_ADDRESS: "1 Main St, Springfield" }), "1 Main St, Springfield");
  });

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
      "lifecycle-start", "lifecycle-habit", "lifecycle-plus", "sale-offer", "sale-reminder",
    ]) {
      assert.ok(TEMPLATE_IDS.includes(id as never), id);
    }
  });
});
