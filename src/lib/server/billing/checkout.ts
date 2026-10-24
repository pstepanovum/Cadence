// FILE: src/lib/server/billing/checkout.ts
//
// Web billing: Stripe Checkout to start Cadence Plus and the Customer Portal to
// manage it. Prices are found by lookup key (cadence_plus_monthly,
// cadence_plus_yearly), never by a price id in the environment, so the owner
// can replace a price in Stripe without a deploy. The yearly plan has a 7-day
// trial, once per customer: a customer who ever had a Cadence subscription
// gets none. The Portal is configured in the Stripe dashboard; only its return
// URL (/account) is set here.
import type { StripeClient as Stripe } from "./stripe-client";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { appOrigin } from "../env";
import { readAccount } from "../entitlement";
import { db as defaultDb } from "../firebase";
import { PLUS_LOOKUP_KEYS, YEARLY_TRIAL_DAYS, type PlusInterval } from "./stripe-map";
import { stripe } from "./stripe-client";

export type CheckoutErrorCode = "already_plus" | "price_missing" | "no_customer" | "not_configured";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function isPlusInterval(value: unknown): value is PlusInterval {
  return value === "monthly" || value === "yearly";
}

/** The customer for this learner, created with our tags the first time. */
async function ensureCustomer(client: Stripe, firestore: Firestore, uid: string, email: string | null): Promise<string> {
  const userRef = firestore.collection("users").doc(uid);
  const account = readAccount((await userRef.get()).data());
  if (account.stripeCustomerId) return account.stripeCustomerId;

  const customer = await client.customers.create(
    { email: email ?? undefined, metadata: { firebase_uid: uid, app: "cadence" } },
    // Two quick clicks create one customer, not two.
    { idempotencyKey: `cadence-customer-${uid}` },
  );
  await userRef.set({ stripeCustomerId: customer.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return customer.id;
}

async function hadSubscription(client: Stripe, customerId: string): Promise<boolean> {
  const list = await client.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
  return list.data.length > 0;
}

export async function createCheckoutSession(
  input: { uid: string; email: string | null; interval: PlusInterval },
  deps: { db?: Firestore; client?: Stripe } = {},
): Promise<{ url: string; trialDays: number }> {
  const firestore = deps.db ?? defaultDb();
  const client = deps.client ?? stripe();
  const account = readAccount((await firestore.collection("users").doc(input.uid).get()).data());
  if (account.isPlus) throw new CheckoutError("already_plus", "You already have Cadence Plus.");

  const lookupKey = PLUS_LOOKUP_KEYS[input.interval];
  const prices = await client.prices.list({ lookup_keys: [lookupKey], active: true, expand: ["data.product"], limit: 1 });
  const price = prices.data[0];
  const product = price?.product as Stripe.Product | undefined;
  if (!price || product?.metadata?.app !== "cadence") throw new CheckoutError("price_missing", "This plan isn't available right now.");

  const customerId = await ensureCustomer(client, firestore, input.uid, input.email);
  const trialDays = input.interval === "yearly" && !(await hadSubscription(client, customerId)) ? YEARLY_TRIAL_DAYS : 0;
  const origin = appOrigin();

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.uid,
    line_items: [{ price: price.id, quantity: 1 }],
    subscription_data: {
      metadata: { firebase_uid: input.uid, app: "cadence" },
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    },
    metadata: { firebase_uid: input.uid, app: "cadence" },
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/account?checkout=canceled`,
  });
  if (!session.url) throw new CheckoutError("not_configured", "Stripe did not return a Checkout link.");
  return { url: session.url, trialDays };
}

export async function createPortalSession(input: { uid: string }, deps: { db?: Firestore; client?: Stripe } = {}): Promise<{ url: string }> {
  const firestore = deps.db ?? defaultDb();
  const account = readAccount((await firestore.collection("users").doc(input.uid).get()).data());
  if (!account.stripeCustomerId) throw new CheckoutError("no_customer", "There's no web subscription on this account.");
  const session = await (deps.client ?? stripe()).billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${appOrigin()}/account`,
  });
  return { url: session.url };
}
