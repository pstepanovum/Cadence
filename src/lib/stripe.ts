// FILE: src/lib/stripe.ts
import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * The Stripe client, created on first use. The SDK refuses an empty key, so
 * building it at import time crashed every page that imports this module
 * (checkout included) on a server without Stripe configured.
 */
export function getStripe(): Stripe {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Stripe billing is not configured: set STRIPE_SECRET_KEY.");
    }
    client = new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID,
  );
}
