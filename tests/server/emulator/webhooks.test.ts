// FILE: tests/server/emulator/webhooks.test.ts
//
// Billing webhooks against the Firestore emulator: each event maps to the
// right Plus record and email (docs/PLATFORM.md section 9), a replay is
// `duplicate: true` and changes and queues nothing, an older event never
// overwrites a newer one, and Plus is right with two sources.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { DAY, clearFirestore, plusRecord, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { handleStripeEvent, type StripeApi } from "../../../src/lib/server/billing/stripe-webhook.ts";
import { handleRevenueCatEvent, type RevenueCatApi } from "../../../src/lib/server/billing/revenuecat.ts";
import type { StripeSubscriptionLike } from "../../../src/lib/server/billing/stripe-map.ts";
import { requestDeletion } from "../../../src/lib/server/account.ts";
import { readFileSync } from "node:fs";

const NOW = Date.UTC(2026, 9, 24, 12);
const UID = "stripeUser0001";

function subscription(over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: "sub_test",
    status: "active",
    customer: "cus_test",
    metadata: { firebase_uid: UID, app: "cadence" },
    cancel_at_period_end: false,
    items: { data: [{ price: { lookup_key: "cadence_plus_monthly", product: { metadata: { app: "cadence" } } }, current_period_end: (NOW + 30 * DAY) / 1000 }] },
    ...over,
  };
}

function fakeStripe(live: StripeSubscriptionLike | null): StripeApi {
  return { retrieveSubscription: async () => live, customerUid: async () => UID };
}

const stripeEvent = (id: string, type: string, object: Record<string, unknown>, created = NOW / 1000) => ({ id, type, created, data: { object } });

async function mail(uid: string) {
  const snapshot = await db().collection("mailQueue").where("uid", "==", uid).get();
  return snapshot.docs.map((doc) => doc.data().template as string).sort();
}

async function user(uid: string) {
  return (await db().collection("users").doc(uid).get()).data() ?? {};
}

describe("stripe webhook", { skip }, () => {
  beforeEach(async () => {
    await clearFirestore();
    await db().collection("users").doc(UID).set({ email: "a@example.com" });
  });

  it("checkout.session.completed turns Plus on, stores the customer, welcomes once", async () => {
    const event = stripeEvent("evt_checkout", "checkout.session.completed", { mode: "subscription", client_reference_id: UID, customer: "cus_test", subscription: "sub_test" });
    const first = await handleStripeEvent(event, { api: fakeStripe(subscription()), now: NOW });
    assert.equal(first.body.applied, true);
    const data = await user(UID);
    assert.equal(data.plus.active, true);
    assert.equal(data.plusSources.stripe.productId, "dev.pstepanov.cadence.plus.monthly");
    assert.equal(data.stripeCustomerId, "cus_test");
    assert.deepEqual(await mail(UID), ["plus-welcome"]);

    const replay = await handleStripeEvent(event, { api: fakeStripe(subscription()), now: NOW });
    assert.equal(replay.body.duplicate, true);
    assert.deepEqual(await mail(UID), ["plus-welcome"]);
  });

  it("a yearly trial queues trial-started instead", async () => {
    const trial = subscription({ status: "trialing", items: { data: [{ price: { lookup_key: "cadence_plus_yearly" }, current_period_end: (NOW + 7 * DAY) / 1000 }] } });
    await handleStripeEvent(stripeEvent("evt_trial", "checkout.session.completed", { mode: "subscription", client_reference_id: UID, subscription: "sub_test" }), { api: fakeStripe(trial), now: NOW });
    assert.deepEqual(await mail(UID), ["trial-started"]);
    assert.equal((await user(UID)).plusSources.stripe.trial, true);
  });

  it("cancel at period end keeps Plus and says so; deletion ends it and schedules the purge", async () => {
    await handleStripeEvent(stripeEvent("evt_c", "customer.subscription.created", subscription() as never), { api: fakeStripe(subscription()), now: NOW });
    await handleStripeEvent(stripeEvent("evt_u", "customer.subscription.updated", subscription() as never, NOW / 1000 + 10), { api: fakeStripe(subscription({ cancel_at_period_end: true })), now: NOW + 10_000 });
    let data = await user(UID);
    assert.equal(data.plus.active, true);
    assert.equal(data.plus.willRenew, false);
    assert.deepEqual(await mail(UID), ["plus-canceled"]);

    await handleStripeEvent(stripeEvent("evt_d", "customer.subscription.deleted", subscription({ status: "canceled" }) as never, NOW / 1000 + 20), { api: fakeStripe(null), now: NOW + 20_000 });
    data = await user(UID);
    assert.equal(data.plus.active, false);
    assert.equal(typeof data.detailPurgeAt, "number");
    assert.deepEqual(await mail(UID), ["plus-canceled", "plus-ended"]);
  });

  it("an older event from the payload never overwrites a newer record", async () => {
    await handleStripeEvent(stripeEvent("evt_new", "customer.subscription.updated", subscription({ status: "canceled" }) as never, NOW / 1000 + 100), { api: fakeStripe(null), now: NOW });
    const stale = await handleStripeEvent(stripeEvent("evt_old", "customer.subscription.updated", subscription() as never, NOW / 1000), { api: fakeStripe(null), now: NOW });
    assert.equal(stale.body.applied, false);
    assert.equal((await user(UID)).plus.active, false);
  });

  it("ignores products that are not Cadence's", async () => {
    const other = subscription({ metadata: { firebase_uid: UID }, items: { data: [{ price: { lookup_key: "heft_plus", product: { metadata: { app: "heft" } } } }] } });
    const result = await handleStripeEvent(stripeEvent("evt_other", "customer.subscription.updated", other as never), { api: fakeStripe(other), now: NOW });
    assert.ok(result.body.ignored);
    assert.equal((await user(UID)).plus, undefined);
  });

  it("payment failed and paid invoices queue billing-issue and a receipt", async () => {
    const invoice = (id: string, type: string, extra: Record<string, unknown>) =>
      stripeEvent(id, type, { customer: "cus_test", parent: { subscription_details: { subscription: "sub_test", metadata: { app: "cadence", firebase_uid: UID } } }, ...extra });
    await handleStripeEvent(invoice("evt_fail", "invoice.payment_failed", { next_payment_attempt: NOW / 1000 + 86400 }), { api: fakeStripe(subscription({ status: "past_due" })), now: NOW });
    await handleStripeEvent(invoice("evt_paid", "invoice.paid", { amount_paid: 1499, currency: "usd", hosted_invoice_url: "https://invoice.stripe.com/i/x", number: "A-1" }), { api: fakeStripe(subscription()), now: NOW });
    assert.deepEqual(await mail(UID), ["billing-issue", "payment-receipt"]);
  });
  it("a product change queues plan-changed, and a refund queues refund-issued without touching Plus", async () => {
    await handleStripeEvent(stripeEvent("evt_m", "customer.subscription.created", subscription() as never), { api: fakeStripe(subscription()), now: NOW });
    const yearly = subscription({ items: { data: [{ price: { lookup_key: "cadence_plus_yearly", product: { metadata: { app: "cadence" } } }, current_period_end: (NOW + 365 * DAY) / 1000 }] } });
    await handleStripeEvent(stripeEvent("evt_y", "customer.subscription.updated", yearly as never, NOW / 1000 + 10), { api: fakeStripe(yearly), now: NOW + 10_000 });
    assert.equal((await user(UID)).plus.productId, "dev.pstepanov.cadence.plus.yearly");
    assert.deepEqual(await mail(UID), ["plan-changed"]);

    const refund = stripeEvent("evt_r", "charge.refunded", { customer: "cus_test", amount_refunded: 9999, currency: "usd" }, NOW / 1000 + 20);
    await handleStripeEvent(refund, { api: fakeStripe(yearly), now: NOW + 20_000 });
    assert.equal((await user(UID)).plus.active, true, "a refund alone changes no state");
    assert.deepEqual(await mail(UID), ["plan-changed", "refund-issued"]);
    assert.equal((await handleStripeEvent(refund, { api: fakeStripe(yearly), now: NOW + 30_000 })).body.duplicate, true);
    assert.deepEqual(await mail(UID), ["plan-changed", "refund-issued"]);
  });
});

describe("webhooks after an account is deleted", { skip }, () => {
  const deps = { deleteSubscriber: async () => undefined, detachStripe: async () => undefined, deleteBrevoContact: async () => undefined, deleteAuthUser: async () => undefined, revokeOAuth: async () => undefined, now: NOW };

  beforeEach(async () => {
    await clearFirestore();
    await db().collection("users").doc(UID).set({ email: "a@example.com", stripeCustomerId: "cus_test", plusSources: { stripe: plusRecord("stripe", NOW) } });
  });

  it("the cancellation Stripe sends after deletion never brings the account back", async () => {
    const result = await requestDeletion(UID, "a@example.com", deps);
    assert.equal(result.status, "completed");
    assert.equal((await db().collection("users").doc(UID).get()).exists, false);

    const sample = JSON.parse(readFileSync(new URL("../../../scripts/webhooks/fixtures/stripe/04-customer.subscription.deleted.json", import.meta.url), "utf8"));
    sample.id = "evt_after_delete";
    sample.data.object.metadata = { ...(sample.data.object.metadata ?? {}), firebase_uid: UID, app: "cadence" };
    const replay = await handleStripeEvent(sample, { api: fakeStripe(null), now: NOW + 1000 });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.ignored, "no account");
    assert.equal((await db().collection("users").doc(UID).get()).exists, false);
    assert.equal((await db().collection("webhookEvents").doc("stripe:evt_after_delete").get()).data()?.outcome, "ignored: no account");
  });

  it("a RevenueCat event for a deleted or unknown uid is recorded and ignored", async () => {
    await requestDeletion(UID, "a@example.com", deps);
    const expiration = { id: "rc_after_delete", type: "EXPIRATION", app_user_id: UID, product_id: "dev.pstepanov.cadence.plus.yearly", entitlement_ids: ["plus"], period_type: "NORMAL", expiration_at_ms: NOW, event_timestamp_ms: NOW + 1000, environment: "PRODUCTION" };
    assert.equal((await handleRevenueCatEvent(expiration, { now: NOW + 1000 })).body.ignored, "no account");
    assert.equal((await handleRevenueCatEvent({ ...expiration, id: "rc_stranger", app_user_id: "neverSignedIn00000000000001" }, { now: NOW + 1000 })).body.ignored, "no account");
    assert.equal((await db().collection("users").doc(UID).get()).exists, false);
    assert.equal((await db().collection("users").doc("neverSignedIn00000000000001").get()).exists, false);
  });
});

describe("revenuecat webhook", { skip }, () => {
  const RC_UID = "rcUser00000000000000000001";
  const rc = (id: string, type: string, over: Record<string, unknown> = {}) => ({
    id,
    type,
    app_user_id: RC_UID,
    product_id: "dev.pstepanov.cadence.plus.yearly",
    entitlement_ids: ["plus"],
    period_type: "NORMAL",
    expiration_at_ms: NOW + 365 * DAY,
    event_timestamp_ms: NOW,
    environment: "PRODUCTION",
    ...over,
  });

  beforeEach(async () => {
    await clearFirestore();
    await db().collection("users").doc(RC_UID).set({ email: "b@example.com" });
  });

  it("INITIAL_PURCHASE turns Plus on once; the replay is a duplicate", async () => {
    const first = await handleRevenueCatEvent(rc("rc1", "INITIAL_PURCHASE"), { now: NOW });
    assert.equal(first.body.applied, true);
    const replay = await handleRevenueCatEvent(rc("rc1", "INITIAL_PURCHASE"), { now: NOW });
    assert.equal(replay.body.duplicate, true);
    const data = await user(RC_UID);
    assert.equal(data.plus.source, "app_store");
    assert.equal(data.rcAppUserId, RC_UID);
    assert.deepEqual(await mail(RC_UID), ["plus-welcome"]);
  });

  it("walks the lifecycle: billing issue, cancel, uncancel, expire", async () => {
    await handleRevenueCatEvent(rc("a", "INITIAL_PURCHASE"), { now: NOW });
    await handleRevenueCatEvent(rc("b", "BILLING_ISSUE", { event_timestamp_ms: NOW + 1, grace_period_expiration_at_ms: NOW + 380 * DAY }), { now: NOW });
    assert.equal((await user(RC_UID)).plus.active, true);
    await handleRevenueCatEvent(rc("c", "CANCELLATION", { event_timestamp_ms: NOW + 2 }), { now: NOW });
    assert.equal((await user(RC_UID)).plus.willRenew, false);
    await handleRevenueCatEvent(rc("d", "UNCANCELLATION", { event_timestamp_ms: NOW + 3 }), { now: NOW });
    assert.equal((await user(RC_UID)).plus.willRenew, true);
    await handleRevenueCatEvent(rc("e", "EXPIRATION", { event_timestamp_ms: NOW + 4 }), { now: NOW });
    assert.equal((await user(RC_UID)).plus.active, false);
    assert.deepEqual(await mail(RC_UID), ["billing-issue", "plus-canceled", "plus-ended", "plus-welcome"]);
  });

  it("Plus stays on while either source is active", async () => {
    await db().collection("users").doc(RC_UID).set({ plusSources: { stripe: plusRecord("stripe", NOW) } }, { merge: true });
    await handleRevenueCatEvent(rc("x1", "INITIAL_PURCHASE"), { now: NOW });
    await handleRevenueCatEvent(rc("x2", "EXPIRATION", { event_timestamp_ms: NOW + 1 }), { now: NOW });
    const data = await user(RC_UID);
    assert.equal(data.plus.active, true);
    assert.equal(data.plus.source, "stripe");
    assert.deepEqual(await mail(RC_UID), ["plus-welcome"], "no plus-ended while Stripe still keeps Plus on");
  });

  it("ignores anonymous ids and other entitlements, records TEST", async () => {
    assert.equal((await handleRevenueCatEvent(rc("an", "INITIAL_PURCHASE", { app_user_id: "$RCAnonymousID:abc" }), { now: NOW })).body.ignored, "anonymous app user");
    assert.ok((await handleRevenueCatEvent(rc("ot", "INITIAL_PURCHASE", { entitlement_ids: ["other"] }), { now: NOW })).body.ignored);
    assert.equal((await handleRevenueCatEvent(rc("t", "TEST"), { now: NOW })).body.test, true);
    assert.equal((await db().collection("webhookEvents").doc("revenuecat:t").get()).exists, true);
  });

  it("TRANSFER rereads both people from RevenueCat", async () => {
    const OTHER = "rcUser00000000000000000002";
    await db().collection("users").doc(OTHER).set({ email: "c@example.com" });
    await handleRevenueCatEvent(rc("p", "INITIAL_PURCHASE"), { now: NOW });
    const api: RevenueCatApi = {
      subscriberRecord: async (uid, now) => (uid === OTHER ? { ...plusRecord("app_store", now) } : { ...plusRecord("app_store", now), active: false }),
    } as RevenueCatApi;
    await handleRevenueCatEvent(rc("tr", "TRANSFER", { transferred_from: [RC_UID], transferred_to: [OTHER], event_timestamp_ms: NOW + 5 }), { now: NOW, api });
    assert.equal((await user(RC_UID)).plus.active, false);
    assert.equal((await user(OTHER)).plus.active, true);
  });
});
