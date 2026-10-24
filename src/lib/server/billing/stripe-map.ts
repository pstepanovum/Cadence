// FILE: src/lib/server/billing/stripe-map.ts
//
// Pure mapping from Stripe objects to Cadence's Plus record. Typed loosely on
// purpose (only the fields read here), so tests and the replay fixtures can
// pass plain JSON.
import type { StoredPlusRecord } from "../entitlement";

export const PLUS_LOOKUP_KEYS = {
  monthly: "cadence_plus_monthly",
  yearly: "cadence_plus_yearly",
} as const;

export type PlusInterval = keyof typeof PLUS_LOOKUP_KEYS;

export const PRODUCT_IDS: Record<string, string> = {
  cadence_plus_monthly: "dev.pstepanov.cadence.plus.monthly",
  cadence_plus_yearly: "dev.pstepanov.cadence.plus.yearly",
};

/** Web trials: 7 days on the yearly plan, once per customer. */
export const YEARLY_TRIAL_DAYS = 7;

export interface StripeProductLike {
  id?: string;
  metadata?: Record<string, string> | null;
}

export interface StripePriceLike {
  id?: string;
  lookup_key?: string | null;
  product?: string | StripeProductLike | null;
}

export interface StripeSubscriptionLike {
  id: string;
  status: string;
  customer?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  items?: { data?: { price?: StripePriceLike | null; current_period_end?: number | null }[] } | null;
}

export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function firstItem(sub: StripeSubscriptionLike) {
  return sub.items?.data?.[0] ?? null;
}

export function lookupKeyOf(sub: StripeSubscriptionLike): string | null {
  return firstItem(sub)?.price?.lookup_key ?? null;
}

export function productIdOf(sub: StripeSubscriptionLike): string {
  const key = lookupKeyOf(sub);
  return (key && PRODUCT_IDS[key]) || key || "";
}

/**
 * The Stripe account is shared with other products, so only subscriptions to
 * a product tagged metadata.app = cadence count. The subscription's own
 * metadata (set at Checkout) and our lookup keys are accepted as well, for a
 * payload whose product was not expanded.
 */
export function isCadenceSubscription(sub: StripeSubscriptionLike): boolean {
  if (sub.metadata?.app === "cadence") return true;
  return (sub.items?.data ?? []).some((item) => {
    const product = item.price?.product;
    if (product && typeof product === "object" && product.metadata?.app === "cadence") return true;
    return Boolean(item.price?.lookup_key && PRODUCT_IDS[item.price.lookup_key]);
  });
}

export function uidOf(sub: StripeSubscriptionLike): string | null {
  const uid = sub.metadata?.firebase_uid;
  return typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : null;
}

/** Statuses that keep Plus on. past_due keeps it during Stripe's retries. */
export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function periodEnd(sub: StripeSubscriptionLike): number | null {
  const end = firstItem(sub)?.current_period_end ?? sub.current_period_end ?? (sub.status === "trialing" ? sub.trial_end : null);
  return typeof end === "number" ? end * 1000 : null;
}

export function recordFromSubscription(sub: StripeSubscriptionLike, eventAt: number, now: number): StoredPlusRecord {
  const active = ACTIVE_STATUSES.has(sub.status);
  return {
    active,
    source: "stripe",
    productId: productIdOf(sub),
    expiresAt: periodEnd(sub),
    willRenew: active && !sub.cancel_at_period_end && !sub.cancel_at,
    updatedAt: now,
    eventAt,
    ...(sub.status === "trialing" ? { trial: true } : {}),
  };
}
