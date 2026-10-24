// FILE: src/lib/server/billing/stripe-client.ts
//
// The Stripe SDK, created on first use from STRIPE_SECRET_KEY, so a server
// without Stripe keys still starts. The same API version as src/lib/stripe.ts.
import StripeSDK from "stripe";
import type { Stripe as StripeClient } from "stripe";

export type { StripeClient };

let client: StripeClient | null = null;

export function isStripeKeyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

/** The SDK's constructor, typed the same under every module resolution the repo uses. */
export const StripeConstructor = StripeSDK as unknown as new (key: string, config: { apiVersion: string }) => StripeClient;

export function stripe(): StripeClient {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("Stripe billing is not configured: set STRIPE_SECRET_KEY.");
    client = new StripeConstructor(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return client;
}
