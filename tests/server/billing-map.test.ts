// FILE: tests/server/billing-map.test.ts
//
// The pure parts of billing: Stripe subscriptions and RevenueCat events to
// Plus records and emails. The transactions around them are covered by the
// emulator tests in tests/server/emulator/.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCadenceSubscription, periodEnd, productIdOf, recordFromSubscription, uidOf } from "../../src/lib/server/billing/stripe-map.ts";
import { isFirebaseUid, recordFromSubscriber, revenueCatEffect, touchesPlus, type RevenueCatEvent } from "../../src/lib/server/billing/revenuecat-map.ts";
import { isAuthorizedRevenueCat } from "../../src/lib/server/billing/revenuecat.ts";
import type { StoredPlusRecord } from "../../src/lib/server/entitlement.ts";

const NOW = Date.UTC(2026, 9, 24);
const DAY = 86_400_000;

const sub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  metadata: { firebase_uid: "uid123", app: "cadence" },
  cancel_at_period_end: false,
  cancel_at: null,
  trial_end: null,
  items: { data: [{ price: { lookup_key: "cadence_plus_yearly", product: { metadata: { app: "cadence" } } }, current_period_end: (NOW + 300 * DAY) / 1000 }] },
  ...over,
});

describe("stripe mapping", () => {
  it("maps an active subscription to an active, renewing record", () => {
    const record = recordFromSubscription(sub(), NOW, NOW);
    assert.equal(record.active, true);
    assert.equal(record.willRenew, true);
    assert.equal(record.productId, "dev.pstepanov.cadence.plus.yearly");
    assert.equal(record.expiresAt, NOW + 300 * DAY);
    assert.equal(record.source, "stripe");
  });

  it("keeps Plus on while trialing or past due, off when canceled", () => {
    assert.equal(recordFromSubscription(sub({ status: "trialing" }), NOW, NOW).trial, true);
    assert.equal(recordFromSubscription(sub({ status: "past_due" }), NOW, NOW).active, true);
    assert.equal(recordFromSubscription(sub({ status: "canceled" }), NOW, NOW).active, false);
    assert.equal(recordFromSubscription(sub({ status: "unpaid" }), NOW, NOW).active, false);
  });

  it("stops renewing when canceled at period end", () => {
    assert.equal(recordFromSubscription(sub({ cancel_at_period_end: true }), NOW, NOW).willRenew, false);
  });

  it("recognises only Cadence products on the shared account", () => {
    assert.equal(isCadenceSubscription(sub()), true);
    assert.equal(isCadenceSubscription(sub({ metadata: {}, items: { data: [{ price: { lookup_key: "other", product: { metadata: { app: "heft" } } } }] } })), false);
    assert.equal(isCadenceSubscription(sub({ metadata: {}, items: { data: [{ price: { lookup_key: "cadence_plus_monthly", product: "prod_x" } }] } })), true);
  });

  it("reads the uid and product safely", () => {
    assert.equal(uidOf(sub()), "uid123");
    assert.equal(uidOf(sub({ metadata: { firebase_uid: "../../etc" } })), null);
    assert.equal(productIdOf(sub({ items: { data: [{ price: { lookup_key: "cadence_plus_monthly" } }] } })), "dev.pstepanov.cadence.plus.monthly");
    assert.equal(periodEnd(sub({ items: { data: [{}] }, current_period_end: 1000 })), 1_000_000);
  });
});

const event = (type: string, over: Partial<RevenueCatEvent> = {}): RevenueCatEvent => ({
  id: `evt-${type}`,
  type,
  app_user_id: "uid123",
  product_id: "dev.pstepanov.cadence.plus.monthly",
  entitlement_ids: ["plus"],
  period_type: "NORMAL",
  expiration_at_ms: NOW + 30 * DAY,
  event_timestamp_ms: NOW,
  environment: "PRODUCTION",
  ...over,
});

const stored = (over: Partial<StoredPlusRecord> = {}): StoredPlusRecord => ({
  active: true,
  source: "app_store",
  productId: "dev.pstepanov.cadence.plus.monthly",
  expiresAt: NOW + 10 * DAY,
  willRenew: true,
  updatedAt: NOW - DAY,
  eventAt: NOW - DAY,
  ...over,
});

describe("revenuecat mapping", () => {
  it("INITIAL_PURCHASE turns Plus on and welcomes, or starts a trial", () => {
    const paid = revenueCatEffect(event("INITIAL_PURCHASE"), null, NOW, false);
    assert.equal(paid.record?.active, true);
    assert.deepEqual(paid.emails.map((e) => e.template), ["plus-welcome"]);
    const trial = revenueCatEffect(event("INITIAL_PURCHASE", { period_type: "TRIAL" }), null, NOW, false);
    assert.deepEqual(trial.emails.map((e) => e.template), ["trial-started"]);
    assert.equal(trial.record?.trial, true);
  });

  it("RENEWAL extends quietly", () => {
    const effect = revenueCatEffect(event("RENEWAL", { expiration_at_ms: NOW + 60 * DAY }), stored(), NOW, false);
    assert.equal(effect.record?.expiresAt, NOW + 60 * DAY);
    assert.equal(effect.emails.length, 0);
  });

  it("CANCELLATION keeps Plus to the end of the period, a refund ends it now", () => {
    const cancel = revenueCatEffect(event("CANCELLATION"), stored(), NOW, false);
    assert.equal(cancel.record?.active, true);
    assert.equal(cancel.record?.willRenew, false);
    assert.deepEqual(cancel.emails.map((e) => e.template), ["plus-canceled"]);
    const refund = revenueCatEffect(event("CANCELLATION", { cancel_reason: "CUSTOMER_SUPPORT", price_in_purchased_currency: 14.99, currency: "USD" }), stored(), NOW, false);
    assert.equal(refund.record?.active, false);
    assert.deepEqual(refund.emails.map((e) => e.template), ["refund-issued"]);
    assert.equal(refund.emails[0].props.amountMinor, 1499);
  });

  it("UNCANCELLATION renews again, SUBSCRIPTION_PAUSED stops renewing", () => {
    assert.equal(revenueCatEffect(event("UNCANCELLATION"), stored({ willRenew: false }), NOW, false).record?.willRenew, true);
    assert.equal(revenueCatEffect(event("SUBSCRIPTION_PAUSED"), stored(), NOW, false).record?.willRenew, false);
  });

  it("EXPIRATION ends Plus, but says nothing while Stripe still keeps it on", () => {
    const alone = revenueCatEffect(event("EXPIRATION"), stored(), NOW, false);
    assert.equal(alone.record?.active, false);
    assert.deepEqual(alone.emails.map((e) => e.template), ["plus-ended"]);
    assert.equal(revenueCatEffect(event("EXPIRATION"), stored(), NOW, true).emails.length, 0);
  });

  it("BILLING_ISSUE keeps Plus through the grace period", () => {
    const effect = revenueCatEffect(event("BILLING_ISSUE", { grace_period_expiration_at_ms: NOW + 16 * DAY }), stored(), NOW, false);
    assert.equal(effect.record?.active, true);
    assert.equal(effect.record?.expiresAt, NOW + 16 * DAY);
    assert.deepEqual(effect.emails.map((e) => e.template), ["billing-issue"]);
  });

  it("PRODUCT_CHANGE switches the product", () => {
    const effect = revenueCatEffect(event("PRODUCT_CHANGE", { new_product_id: "dev.pstepanov.cadence.plus.yearly" }), stored(), NOW, false);
    assert.equal(effect.record?.productId, "dev.pstepanov.cadence.plus.yearly");
    assert.deepEqual(effect.emails.map((e) => e.template), ["plan-changed"]);
  });

  it("TEST and unknown types change nothing", () => {
    assert.equal(revenueCatEffect(event("TEST"), null, NOW, false).record, null);
  });

  it("marks sandbox events", () => {
    assert.equal(revenueCatEffect(event("INITIAL_PURCHASE", { environment: "SANDBOX" }), null, NOW, false).record?.sandbox, true);
  });

  it("knows a Firebase uid from an anonymous id, and the plus entitlement", () => {
    assert.equal(isFirebaseUid("aB3dE5fG7hI9jK1lM3nO5pQ7rS9t"), true);
    assert.equal(isFirebaseUid("$RCAnonymousID:abc"), false);
    assert.equal(touchesPlus(event("RENEWAL", { entitlement_ids: ["other"] })), false);
    assert.equal(touchesPlus(event("RENEWAL", { entitlement_ids: null, entitlement_id: "plus" })), true);
  });

  it("reads a subscriber for TRANSFER", () => {
    const record = recordFromSubscriber({ subscriber: { entitlements: { plus: { expires_date: new Date(NOW + DAY).toISOString(), product_identifier: "p" } } } }, NOW);
    assert.equal(record.active, true);
    assert.equal(recordFromSubscriber({ subscriber: { entitlements: {} } }, NOW).active, false);
  });

  it("checks the webhook bearer in constant time", () => {
    const env = { REVENUECAT_WEBHOOK_SECRET: "s3cret-value" };
    assert.equal(isAuthorizedRevenueCat("Bearer s3cret-value", env), true);
    assert.equal(isAuthorizedRevenueCat("Bearer wrong", env), false);
    assert.equal(isAuthorizedRevenueCat(null, env), false);
    assert.equal(isAuthorizedRevenueCat("Bearer s3cret-value", {}), false);
  });
});
