// FILE: src/lib/server/billing/revenuecat-map.ts
//
// Pure mapping from a RevenueCat webhook event to the App Store Plus record
// and the email it causes. app_user_id is the Firebase uid, because the iOS
// app calls Purchases.logIn(uid) after sign-in; an anonymous id
// ($RCAnonymousID:...) belongs to nobody we know and changes nothing.
import type { StoredPlusRecord } from "../entitlement";
import type { TemplateId } from "../email/templates/index";

export const PLUS_ENTITLEMENT = "plus";

export const REVENUECAT_EVENT_TYPES = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "UNCANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "PRODUCT_CHANGE",
  "TRANSFER",
  "SUBSCRIPTION_PAUSED",
  "TEST",
] as const;
export type RevenueCatEventType = (typeof REVENUECAT_EVENT_TYPES)[number];

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  new_product_id?: string | null;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  period_type?: string;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  environment?: string;
  cancel_reason?: string | null;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  transferred_from?: string[];
  transferred_to?: string[];
}

export function isFirebaseUid(value: unknown): value is string {
  return typeof value === "string" && !value.startsWith("$RCAnonymousID") && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function touchesPlus(event: RevenueCatEvent): boolean {
  const ids = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  return ids.includes(PLUS_ENTITLEMENT);
}

export interface RevenueCatEffect {
  record: StoredPlusRecord | null;
  emails: { template: TemplateId; props: Record<string, unknown> }[];
}

/**
 * The new app_store record and emails for one event, given the stored record.
 * `otherSourceActive` says whether Stripe still keeps Plus on, in which case
 * an App Store expiry ends nothing and sends nothing.
 */
export function revenueCatEffect(event: RevenueCatEvent, stored: StoredPlusRecord | null, now: number, otherSourceActive: boolean): RevenueCatEffect {
  const eventAt = typeof event.event_timestamp_ms === "number" ? event.event_timestamp_ms : now;
  const sandbox = event.environment === "SANDBOX";
  const expires = typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : (stored?.expiresAt ?? null);
  const base: StoredPlusRecord = {
    active: stored?.active ?? false,
    source: "app_store",
    productId: event.product_id || stored?.productId || "",
    expiresAt: expires,
    willRenew: stored?.willRenew ?? false,
    updatedAt: now,
    eventAt,
    ...(sandbox ? { sandbox: true } : {}),
  };
  const trial = event.period_type === "TRIAL";

  switch (event.type) {
    case "INITIAL_PURCHASE": {
      const record = { ...base, active: true, willRenew: true, ...(trial ? { trial: true } : {}) };
      return {
        record,
        emails: [
          trial
            ? { template: "trial-started", props: { productId: record.productId, store: "app_store", trialEndsAt: record.expiresAt } }
            : { template: "plus-welcome", props: { productId: record.productId, store: "app_store", renewsAt: record.expiresAt } },
        ],
      };
    }
    case "RENEWAL":
      return { record: { ...base, active: true, willRenew: true, ...(trial ? { trial: true } : {}) }, emails: [] };
    case "CANCELLATION": {
      // A refund through Apple ends Plus at once; otherwise it runs to the end of the period.
      if (event.cancel_reason === "CUSTOMER_SUPPORT") {
        const amount = typeof event.price_in_purchased_currency === "number" ? Math.round(Math.abs(event.price_in_purchased_currency) * 100) : 0;
        return {
          record: { ...base, active: false, willRenew: false, expiresAt: now },
          emails: amount > 0 ? [{ template: "refund-issued", props: { amountMinor: amount, currency: event.currency ?? "USD", refundedAt: eventAt } }] : [],
        };
      }
      const wasRenewing = stored?.willRenew ?? true;
      return {
        record: { ...base, willRenew: false },
        emails: wasRenewing ? [{ template: "plus-canceled", props: { store: "app_store", endsAt: base.expiresAt } }] : [],
      };
    }
    case "UNCANCELLATION":
      return { record: { ...base, willRenew: true }, emails: [] };
    case "EXPIRATION":
      return {
        record: { ...base, active: false, willRenew: false },
        emails: otherSourceActive || stored?.active === false ? [] : [{ template: "plus-ended", props: { purgeAt: now + 90 * 86_400_000 } }],
      };
    case "BILLING_ISSUE": {
      const grace = typeof event.grace_period_expiration_at_ms === "number" ? event.grace_period_expiration_at_ms : null;
      return {
        record: { ...base, active: true, expiresAt: grace ?? base.expiresAt },
        emails: [{ template: "billing-issue", props: { store: "app_store", updateUrl: "", graceEndsAt: grace ?? base.expiresAt } }],
      };
    }
    case "PRODUCT_CHANGE": {
      const to = event.new_product_id || event.product_id || base.productId;
      const from = stored?.productId || event.product_id || "";
      return {
        record: { ...base, productId: to },
        emails: from && to && from !== to ? [{ template: "plan-changed", props: { fromProductId: from, toProductId: to, effectiveAt: base.expiresAt, store: "app_store" } }] : [],
      };
    }
    case "SUBSCRIPTION_PAUSED":
      return { record: { ...base, willRenew: false }, emails: [] };
    default:
      return { record: null, emails: [] };
  }
}

/**
 * The App Store record for a subscriber as RevenueCat's REST API reports it
 * (GET /v1/subscribers/{uid}), used for TRANSFER, where the event names the
 * people but not their new state.
 */
export function recordFromSubscriber(body: unknown, now: number): StoredPlusRecord {
  const subscriber = (body as { subscriber?: { entitlements?: Record<string, Record<string, unknown>> } } | null)?.subscriber;
  const entitlement = subscriber?.entitlements?.[PLUS_ENTITLEMENT];
  const epoch = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
  if (!entitlement) return { active: false, source: "app_store", productId: "", expiresAt: null, willRenew: false, updatedAt: now, eventAt: now };
  const expires = epoch(entitlement.expires_date);
  const grace = epoch(entitlement.grace_period_expires_date);
  const until = grace !== null && expires !== null && grace > expires ? grace : expires;
  return {
    active: entitlement.expires_date === null || (until !== null && until > now),
    source: "app_store",
    productId: typeof entitlement.product_identifier === "string" ? entitlement.product_identifier : "",
    expiresAt: until,
    willRenew: until !== null && until > now,
    updatedAt: now,
    eventAt: now,
  };
}
