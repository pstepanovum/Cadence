// FILE: tests/email/lifecycle.test.ts
//
// The lifecycle sequence: which step is due (local evening, days since
// signup, a day of grace, consent per category, the offer, the stops for
// Plus and inactivity), the offer config, the delivery-time consent check,
// the queued props, Brevo's UUID idempotency keys, and the password-reset
// "no account" errors.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isNoAccountForLinkError } from "../../src/lib/server/action-link-errors.ts";
import { brevoIdempotencyKey, brevoPayload } from "../../src/lib/server/email/brevo.ts";
import { offerRedeemUrl, parseOfferEnd, readOffer } from "../../src/lib/server/email/offer.ts";
import { consentBlock } from "../../src/lib/server/email/queue.ts";
import { renderFixture, renderTemplate } from "../../src/lib/server/email/templates/index.ts";
import { cleanTimeZone, lifecycleStepDue, localTime, LIFECYCLE_STEPS, type LifecycleFacts } from "../../src/lib/server/lifecycle-plan.ts";
import { lifecycleProps } from "../../src/lib/server/lifecycle.ts";
import { emptySummary } from "../../src/lib/platform/progress-model.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Signed up 1 November 2026, 10:00 in New York (14:00 UTC).
const SIGNUP = Date.UTC(2026, 10, 1, 14, 0);
/** 19:00 New York time (00:00 UTC next day, EST) on day `n` after signup. */
const eveningNY = (n: number) => Date.UTC(2026, 10, 1 + n, 19 + 5, 0);

function facts(overrides: Partial<LifecycleFacts> = {}): LifecycleFacts {
  return {
    now: eveningNY(1),
    createdAt: SIGNUP,
    timeZone: "America/New_York",
    isPlus: false,
    lastActiveAt: null,
    prefs: { lifecycle: true, newsletter: false },
    sent: new Set(),
    offerRunning: false,
    ...overrides,
  };
}
const due = (overrides: Partial<LifecycleFacts> = {}) => {
  const decision = lifecycleStepDue(facts(overrides));
  return decision.step?.id ?? `none:${(decision as { reason: string }).reason}`;
};

describe("lifecycle schedule", () => {
  it("sends day 1, 3 and 6 tips in the learner's evening", () => {
    assert.equal(due({ now: eveningNY(1) }), "day1");
    assert.equal(due({ now: eveningNY(3), sent: new Set(["day1"]) }), "day3");
    assert.equal(due({ now: eveningNY(6), sent: new Set(["day1", "day3"]) }), "day6");
  });

  it("waits for the evening in the learner's own zone", () => {
    assert.equal(due({ now: Date.UTC(2026, 10, 2, 17, 0) }), "none:not evening"); // 12:00 in New York
    assert.equal(due({ now: Date.UTC(2026, 10, 3, 2, 30) }), "none:not evening"); // 21:30 in New York
    // The same instant is evening in Berlin (18:00 CET) on day 1.
    assert.equal(due({ now: Date.UTC(2026, 10, 2, 17, 0), timeZone: "Europe/Berlin" }), "day1");
    // No zone: UTC.
    assert.equal(due({ now: Date.UTC(2026, 10, 2, 18, 30), timeZone: null }), "day1");
  });

  it("sends nothing on day 0, between steps, or twice", () => {
    assert.equal(due({ now: Date.UTC(2026, 10, 1, 23, 0) }), "none:nothing due"); // 18:00 NY on signup day
    assert.equal(due({ now: eveningNY(4), sent: new Set(["day1", "day3"]) }), "none:nothing due");
    assert.equal(due({ now: eveningNY(1), sent: new Set(["day1"]) }), "none:nothing due");
  });

  it("catches up a step missed by one day, never older, never after a later step", () => {
    assert.equal(due({ now: eveningNY(2) }), "day1");
    assert.equal(due({ now: eveningNY(5), sent: new Set(["day1"]) }), "none:nothing due");
    assert.equal(due({ now: eveningNY(7), sent: new Set(["day1", "day6"]) }), "none:nothing due");
  });

  it("stops for Plus from any source and after 21 days without practice", () => {
    assert.equal(due({ isPlus: true }), "none:has plus");
    assert.equal(due({ now: eveningNY(13), createdAt: eveningNY(13) - 30 * DAY, lastActiveAt: eveningNY(13) - 22 * DAY }), "none:inactive");
  });

  it("skips tips for someone who unsubscribed from them", () => {
    assert.equal(due({ prefs: { lifecycle: false, newsletter: false } }), "none:nothing due");
  });

  it("sends the sale only with the offers opt-in and a running offer", () => {
    const sent = new Set(["day1", "day3", "day6"]);
    assert.equal(due({ now: eveningNY(10), sent, offerRunning: true }), "none:nothing due");
    assert.equal(due({ now: eveningNY(10), sent, prefs: { lifecycle: true, newsletter: true } }), "none:nothing due");
    assert.equal(due({ now: eveningNY(10), sent, offerRunning: true, prefs: { lifecycle: true, newsletter: true } }), "day10");
    // Consent is per category: tips off does not stop an opted-in sale.
    assert.equal(due({ now: eveningNY(10), sent, offerRunning: true, prefs: { lifecycle: false, newsletter: true } }), "day10");
  });

  it("sends the sale reminder only after the sale", () => {
    const optedIn = { offerRunning: true, prefs: { lifecycle: true, newsletter: true } };
    assert.equal(due({ now: eveningNY(13), sent: new Set(["day1", "day3", "day6"]), ...optedIn }), "none:nothing due");
    assert.equal(due({ now: eveningNY(13), sent: new Set(["day1", "day3", "day6", "day10"]), ...optedIn }), "day13");
  });

  it("lists the five steps in order", () => {
    assert.deepEqual(LIFECYCLE_STEPS.map((s) => [s.day, s.template]), [[1, "lifecycle-start"], [3, "lifecycle-habit"], [6, "lifecycle-plus"], [10, "sale-offer"], [13, "sale-reminder"]]);
  });

  it("reads zones safely", () => {
    assert.equal(cleanTimeZone("Europe/Berlin"), "Europe/Berlin");
    assert.equal(cleanTimeZone("Not/AZone"), null);
    assert.equal(cleanTimeZone("../../etc"), null);
    assert.deepEqual(localTime(Date.UTC(2026, 10, 2, 0, 0), "America/New_York"), { day: "2026-11-01", hour: 19 });
  });
});

describe("the offer", () => {
  const now = Date.UTC(2026, 10, 21);
  it("needs code, label and an end in the future", () => {
    const offer = readOffer({ CADENCE_OFFER_CODE: "cadencehalf", CADENCE_OFFER_LABEL: "50% off", CADENCE_OFFER_ENDS: "2026-11-30" }, now);
    assert.deepEqual(offer, { code: "CADENCEHALF", label: "50% off", endsAt: Date.UTC(2026, 10, 30, 23, 59, 59, 999), redeemUrl: "https://apps.apple.com/redeem?ctx=offercodes&id=6826485399&code=CADENCEHALF" });
    assert.equal(readOffer({ CADENCE_OFFER_LABEL: "50% off", CADENCE_OFFER_ENDS: "2026-11-30" }, now), null);
    assert.equal(readOffer({ CADENCE_OFFER_CODE: "CADENCEHALF", CADENCE_OFFER_ENDS: "2026-11-30" }, now), null);
    assert.equal(readOffer({ CADENCE_OFFER_CODE: "CADENCEHALF", CADENCE_OFFER_LABEL: "50% off", CADENCE_OFFER_ENDS: "2026-11-20" }, now), null);
    assert.equal(readOffer({ CADENCE_OFFER_CODE: "BAD CODE!", CADENCE_OFFER_LABEL: "50% off", CADENCE_OFFER_ENDS: "2026-11-30" }, now), null);
    assert.equal(readOffer({}, now), null);
  });

  it("parses end dates strictly", () => {
    assert.equal(parseOfferEnd("2026-02-31"), null);
    assert.equal(parseOfferEnd("tomorrow"), null);
    assert.equal(parseOfferEnd("2026-11-30T12:00:00Z"), Date.UTC(2026, 10, 30, 12));
  });

  it("links to Apple's redeem page with the code", () => {
    assert.equal(offerRedeemUrl("CADENCEHALF"), "https://apps.apple.com/redeem?ctx=offercodes&id=6826485399&code=CADENCEHALF");
    const email = renderFixture("sale-offer");
    assert.match(email.html, /apps\.apple\.com\/redeem\?ctx=offercodes&amp;id=6826485399&amp;code=CADENCEHALF/);
    assert.match(email.text, /CADENCEHALF/);
    assert.match(email.text, /renews at the regular price/);
  });
});

describe("delivery-time consent", () => {
  const now = Date.UTC(2026, 10, 21);
  const plus = { plusSources: { code: { active: true, source: "code", productId: "friend", expiresAt: now + DAY, willRenew: false, updatedAt: now } } };
  it("blocks by category, Plus and an ended offer", () => {
    assert.equal(consentBlock("lifecycle", "lifecycle", {}, {}, now), null, "tips are on by default");
    assert.equal(consentBlock("lifecycle", "lifecycle", { emailPrefs: { lifecycle: false } }, {}, now), "lifecycle off");
    assert.equal(consentBlock("newsletter", "lifecycle", {}, {}, now), "newsletter off", "sales are opt-in");
    assert.equal(consentBlock("newsletter", "lifecycle", { emailPrefs: { newsletter: true } }, { endsAt: now - 1 }, now), "offer ended");
    assert.equal(consentBlock("newsletter", "lifecycle", { emailPrefs: { newsletter: true } }, { endsAt: now + DAY }, now), null);
    assert.equal(consentBlock("lifecycle", "lifecycle", plus, {}, now), "has plus");
    assert.equal(consentBlock("reminders", "engagement", {}, {}, now), "reminders off");
    assert.equal(consentBlock("reminders", "engagement", plus, {}, now), "reminders off");
    assert.equal(consentBlock("lifecycle", "lifecycle", undefined, {}, now), "no account");
  });
});

describe("queued props", () => {
  it("the habit email gets the learner's real streak, minutes and lessons", () => {
    const summary = { ...emptySummary(), totalMinutes: 41.6, streak: { current: 3, best: 3, lastDay: "2026-11-04" }, lessonsCompleted: { ...emptySummary().lessonsCompleted, A2: 2, B1: 1 } };
    const step = LIFECYCLE_STEPS[1];
    assert.deepEqual(lifecycleProps(step, { name: "Maria", summary, offer: null, today: "2026-11-04" }), { name: "Maria", streak: 3, minutes: 42, lessons: 3 });
    assert.equal(lifecycleProps(step, { summary, offer: null, today: "2026-11-09" }).streak, 0, "a broken streak shows as none");
  });

  it("the sale gets the configured offer", () => {
    const offer = { code: "CADENCEHALF", label: "50% off", endsAt: 1, redeemUrl: "" };
    assert.deepEqual(lifecycleProps(LIFECYCLE_STEPS[3], { summary: emptySummary(), offer, today: "2026-11-11" }), { code: "CADENCEHALF", label: "50% off", endsAt: 1 });
  });

  it("the habit email reads well with no practice yet", () => {
    const email = renderTemplate("lifecycle-habit", { streak: 0, minutes: 0, lessons: 0, unsubscribeUrl: "https://cadence.pstepanov.dev/u" });
    assert.equal(email.subject, "Make English practice a daily habit");
    assert.match(email.text, /Five minutes a day/);
  });
});

describe("Brevo idempotency keys", () => {
  const SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it("maps readable keys to a deterministic UUID v4 shape", () => {
    const a = brevoIdempotencyKey("lifecycle:uid_123:day1");
    assert.match(a, SHAPE);
    assert.equal(a, brevoIdempotencyKey("lifecycle:uid_123:day1"), "deterministic");
    assert.notEqual(a, brevoIdempotencyKey("lifecycle:uid_123:day3"));
    // The first 16 bytes of sha256("welcome:uid_1") with the version and variant bits set.
    assert.equal(brevoIdempotencyKey("welcome:uid_1"), "0f869a73-6420-48fa-8461-5025e948ebf6");
  });

  it("passes a UUID through and puts the mapped key on the wire", () => {
    assert.equal(brevoIdempotencyKey("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    const payload = brevoPayload({ to: { email: "maria@example.com" }, email: renderFixture("welcome"), idempotencyKey: "welcome:uid_1" }, {});
    assert.match(payload.headers?.idempotencyKey ?? "", SHAPE);
  });
});

describe("password reset for an unknown address", () => {
  it("treats every no-account error as no account", () => {
    assert.ok(isNoAccountForLinkError({ code: "auth/user-not-found" }));
    assert.ok(isNoAccountForLinkError({ code: "auth/email-not-found" }));
    assert.ok(isNoAccountForLinkError(new Error("INTERNAL ASSERT FAILED: Unable to create the email action link")));
    assert.ok(isNoAccountForLinkError({ code: "auth/internal-error", message: "INTERNAL ASSERT FAILED: Unable to create the email action link" }));
    assert.ok(!isNoAccountForLinkError(new Error("Network down")));
    assert.ok(!isNoAccountForLinkError({ code: "auth/too-many-requests" }));
  });
});
