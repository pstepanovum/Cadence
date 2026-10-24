// FILE: src/lib/server/billing/stripe-webhook.ts
//
// POST /api/webhooks/stripe, after the signature has been verified (see the
// route). One transaction per event: the idempotency record, the Plus record
// for the `stripe` source, the resolved `plus`, and any email it queues.
//
// Stripe delivers out of order and retries, so the handler re-reads the
// subscription from Stripe before writing and never trusts the order events
// arrive in. When the re-read is impossible (no key, as in the offline replay
// harness, or a deleted object) it falls back to the event's own copy, dated by
// the event, and an older copy never overwrites a newer one.
import type { Firestore } from "firebase-admin/firestore";

import { appOrigin } from "../env";
import { accountGone, writePlusSource, readAccount, type StoredPlusRecord } from "../entitlement";
import { db as defaultDb } from "../firebase";
import { mailKey, queueMailInTx, type QueueInput } from "../email/queue";
import type { TemplateId } from "../email/templates/index";
import { LAPSED_RETENTION_DAYS } from "../../platform/engine-routing";
import { idOf, isCadenceSubscription, productIdOf, recordFromSubscription, uidOf, type StripeSubscriptionLike } from "./stripe-map";
import { isStripeKeyConfigured, stripe } from "./stripe-client";
import { recordInTx, seenInTx } from "./webhook-events";

export interface StripeEventLike {
  id: string;
  type: string;
  created: number;
  livemode?: boolean;
  data: { object: Record<string, unknown> };
}

export interface StripeApi {
  /** The live subscription with prices and products expanded, or null when it cannot be read. */
  retrieveSubscription(id: string): Promise<StripeSubscriptionLike | null>;
  /** The Cadence uid a customer belongs to, from its metadata. */
  customerUid(customerId: string): Promise<string | null>;
}

export const liveStripeApi: StripeApi = {
  async retrieveSubscription(id) {
    if (!isStripeKeyConfigured()) return null;
    try {
      return (await stripe().subscriptions.retrieve(id, { expand: ["items.data.price.product"] })) as unknown as StripeSubscriptionLike;
    } catch (error) {
      if ((error as { code?: string })?.code === "resource_missing") return null;
      throw error;
    }
  },
  async customerUid(customerId) {
    if (!isStripeKeyConfigured()) return null;
    try {
      const customer = await stripe().customers.retrieve(customerId);
      if ("deleted" in customer && customer.deleted) return null;
      const meta = (customer as { metadata?: Record<string, string> }).metadata ?? {};
      return meta.app === "cadence" && meta.firebase_uid ? meta.firebase_uid : null;
    } catch {
      return null;
    }
  },
};

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
  /** mailQueue keys to deliver once the response is on its way. */
  mailKeys: string[];
}

interface Plan {
  uid: string | null;
  record: StoredPlusRecord | null;
  customerId: string | null;
  /** The older users/{uid}.billing map that existing pages and /api/stripe/cancel still read. */
  billing?: Record<string, unknown>;
  emails: (account: ReturnType<typeof readAccount>, change: { before: StoredPlusRecord | null; after: StoredPlusRecord | null; applied: boolean; nowActive: boolean }) => { template: TemplateId; props: Record<string, unknown> }[];
}

function subscriptionIdOfInvoice(invoice: Record<string, unknown>): string | null {
  const parent = invoice.parent as { subscription_details?: { subscription?: string | { id: string } } } | undefined;
  return idOf(parent?.subscription_details?.subscription ?? (invoice.subscription as string | { id: string } | undefined) ?? null);
}

function invoiceMetadata(invoice: Record<string, unknown>): Record<string, string> {
  const parent = invoice.parent as { subscription_details?: { metadata?: Record<string, string> } } | undefined;
  return parent?.subscription_details?.metadata ?? {};
}

async function loadSubscription(api: StripeApi, id: string | null, fallback: StripeSubscriptionLike | null, event: StripeEventLike, now: number) {
  const live = id ? await api.retrieveSubscription(id) : null;
  const sub = live ?? fallback;
  return sub ? { sub, eventAt: live ? now : event.created * 1000 } : null;
}

function legacyBilling(sub: StripeSubscriptionLike): Record<string, unknown> {
  const iso = (seconds: number | null | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);
  return {
    stripeCustomerId: idOf(sub.customer),
    stripeSubscriptionId: sub.id,
    status: sub.status,
    trialEnd: iso(sub.trial_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    cancelAt: iso(sub.cancel_at),
  };
}

async function plan(event: StripeEventLike, api: StripeApi, now: number): Promise<Plan | { ignore: string }> {
  const object = event.data.object;
  const origin = appOrigin();

  switch (event.type) {
    case "checkout.session.completed": {
      if (object.mode !== "subscription") return { ignore: "not a subscription checkout" };
      const embedded = object.subscription && typeof object.subscription === "object" ? (object.subscription as StripeSubscriptionLike) : null;
      const loaded = await loadSubscription(api, idOf(object.subscription as string | { id: string } | null), embedded, event, now);
      if (!loaded || !isCadenceSubscription(loaded.sub)) return { ignore: "not a Cadence product" };
      const uid = (typeof object.client_reference_id === "string" && object.client_reference_id) || uidOf(loaded.sub);
      const record = recordFromSubscription(loaded.sub, loaded.eventAt, now);
      return {
        uid,
        record,
        customerId: idOf(object.customer as string | null) ?? idOf(loaded.sub.customer),
        billing: legacyBilling(loaded.sub),
        emails: () =>
          record.trial
            ? [{ template: "trial-started", props: { productId: record.productId, store: "web", trialEndsAt: record.expiresAt } }]
            : [{ template: "plus-welcome", props: { productId: record.productId, store: "web", renewsAt: record.expiresAt } }],
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const payload = object as unknown as StripeSubscriptionLike;
      const loaded = await loadSubscription(api, payload.id, payload, event, now);
      if (!loaded || !isCadenceSubscription(loaded.sub)) return { ignore: "not a Cadence product" };
      const sub = event.type === "customer.subscription.deleted" ? { ...loaded.sub, status: "canceled" } : loaded.sub;
      const record = recordFromSubscription(sub, loaded.eventAt, now);
      return {
        uid: uidOf(sub),
        record,
        customerId: idOf(sub.customer),
        billing: legacyBilling(sub),
        emails: (account, change) => {
          if (!change.applied || event.type === "customer.subscription.created") return [];
          const before = account.plusSources.stripe ?? null;
          if (event.type === "customer.subscription.deleted") {
            // Still Plus through the App Store: nothing has ended.
            if (change.nowActive || (before && !before.active)) return [];
            return [{ template: "plus-ended", props: { purgeAt: now + LAPSED_RETENTION_DAYS * 86_400_000 } }];
          }
          const out: { template: TemplateId; props: Record<string, unknown> }[] = [];
          if (before?.willRenew && !record.willRenew && record.active) {
            out.push({ template: "plus-canceled", props: { store: "web", endsAt: record.expiresAt } });
          }
          if (before?.productId && record.productId && before.productId !== record.productId && record.active) {
            out.push({ template: "plan-changed", props: { fromProductId: before.productId, toProductId: record.productId, effectiveAt: now, store: "web" } });
          }
          return out;
        },
      };
    }

    case "invoice.payment_failed":
    case "invoice.paid": {
      const subscriptionId = subscriptionIdOfInvoice(object);
      const meta = invoiceMetadata(object);
      const loaded = await loadSubscription(api, subscriptionId, null, event, now);
      const cadence = loaded ? isCadenceSubscription(loaded.sub) : meta.app === "cadence";
      if (!cadence) return { ignore: "not a Cadence invoice" };
      const uid = (loaded && uidOf(loaded.sub)) || (meta.firebase_uid ?? null);
      if (event.type === "invoice.payment_failed") {
        const next = typeof object.next_payment_attempt === "number" ? object.next_payment_attempt * 1000 : null;
        return {
          uid,
          record: null,
          customerId: idOf(object.customer as string | null),
          emails: () => [{ template: "billing-issue", props: { store: "web", updateUrl: `${origin}/account?billing=update`, graceEndsAt: next } }],
        };
      }
      const paid = typeof object.amount_paid === "number" ? object.amount_paid : 0;
      const url = typeof object.hosted_invoice_url === "string" ? object.hosted_invoice_url : null;
      return {
        uid,
        record: null,
        customerId: idOf(object.customer as string | null),
        emails: () =>
          paid > 0 && url
            ? [{ template: "payment-receipt", props: { productId: loaded ? productIdOf(loaded.sub) : "", amountMinor: paid, currency: object.currency ?? "usd", paidAt: (typeof object.created === "number" ? object.created : event.created) * 1000, invoiceUrl: url, invoiceNumber: typeof object.number === "string" ? object.number : undefined } }]
            : [],
      };
    }

    case "charge.refunded": {
      const customerId = idOf(object.customer as string | null);
      const uid = customerId ? await api.customerUid(customerId) : null;
      if (!uid) return { ignore: "not a Cadence customer" };
      const amount = typeof object.amount_refunded === "number" ? object.amount_refunded : 0;
      return {
        uid,
        record: null,
        customerId,
        emails: () => (amount > 0 ? [{ template: "refund-issued", props: { amountMinor: amount, currency: object.currency ?? "usd", refundedAt: event.created * 1000 } }] : []),
      };
    }

    default:
      return { ignore: "event type not handled" };
  }
}

export async function handleStripeEvent(event: StripeEventLike, deps: { db?: Firestore; api?: StripeApi; now?: number } = {}): Promise<WebhookResult> {
  const firestore = deps.db ?? defaultDb();
  const now = deps.now ?? Date.now();
  const decided = await plan(event, deps.api ?? liveStripeApi, now);

  return firestore.runTransaction(async (tx) => {
    if (await seenInTx(tx, firestore, "stripe", event.id)) {
      return { status: 200, body: { received: true, duplicate: true }, mailKeys: [] };
    }

    if ("ignore" in decided) {
      recordInTx(tx, firestore, "stripe", event.id, { type: event.type, uid: null, outcome: `ignored: ${decided.ignore}` }, now);
      return { status: 200, body: { received: true, ignored: decided.ignore }, mailKeys: [] };
    }

    if (!decided.uid) {
      recordInTx(tx, firestore, "stripe", event.id, { type: event.type, uid: null, outcome: "ignored: no uid" }, now);
      return { status: 200, body: { received: true, ignored: "no Cadence account on this event" }, mailKeys: [] };
    }

    const userRef = firestore.collection("users").doc(decided.uid);
    const snapshot = await tx.get(userRef);
    if (await accountGone(tx, firestore, decided.uid, snapshot.exists)) {
      recordInTx(tx, firestore, "stripe", event.id, { type: event.type, uid: decided.uid, outcome: "ignored: no account" }, now);
      return { status: 200, body: { received: true, ignored: "no account" }, mailKeys: [] };
    }
    const data = snapshot.data();
    const account = readAccount(data, now);

    const extra: Record<string, unknown> = {
      ...(decided.customerId && account.stripeCustomerId !== decided.customerId ? { stripeCustomerId: decided.customerId } : {}),
      ...(decided.billing ? { billing: decided.billing } : {}),
    };
    let change = { before: account.plusSources.stripe ?? null, after: null as StoredPlusRecord | null, applied: true, nowActive: account.isPlus };
    if (decided.record) {
      const result = writePlusSource(tx, userRef, data, decided.record, now, extra);
      change = { before: account.plusSources.stripe ?? null, after: decided.record, applied: result.applied, nowActive: Boolean(result.after?.active) };
    } else if (Object.keys(extra).length > 0) {
      tx.update(userRef, extra);
    }

    const mailKeys: string[] = [];
    for (const email of decided.emails(account, change)) {
      const key = mailKey("stripe", event.id, email.template);
      queueMailInTx(tx, firestore, key, { template: email.template, uid: decided.uid, props: email.props } as QueueInput<TemplateId>, now);
      mailKeys.push(key);
    }

    recordInTx(tx, firestore, "stripe", event.id, { type: event.type, uid: decided.uid, outcome: change.applied ? "applied" : "stale" }, now);
    return { status: 200, body: { received: true, applied: change.applied }, mailKeys };
  });
}

