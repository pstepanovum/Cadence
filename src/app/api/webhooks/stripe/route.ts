// FILE: src/app/api/webhooks/stripe/route.ts
//
// POST https://cadence.pstepanov.dev/api/webhooks/stripe
//
// Reads the raw body and verifies the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET before parsing anything; a bad signature is 400.
// Handling is idempotent by event id (webhookEvents/stripe:<id>), so Stripe's
// retries and the replay harness change nothing the second time.
// Events: checkout.session.completed, customer.subscription.created/updated/
// deleted, invoice.payment_failed, invoice.paid, charge.refunded.
import Stripe from "stripe";
import { after } from "next/server";

import { handleStripeEvent, type StripeEventLike } from "@/lib/server/billing/stripe-webhook";
import { deliverSoon } from "@/lib/server/email/queue";
import { BodyTooLargeError, errorResponse, json, readTextCapped } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifier = new Stripe("sk_unused_for_verification", { apiVersion: "2026-03-25.dahlia" });

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return errorResponse(500, "not_configured", "Stripe webhooks are not configured.");
  const signature = request.headers.get("stripe-signature");
  if (!signature) return errorResponse(400, "bad_signature", "Missing Stripe-Signature.");

  let raw: string;
  try {
    raw = await readTextCapped(request, 512 * 1024);
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return errorResponse(413, "too_large", "Body too large.");
    throw caught;
  }

  let event: StripeEventLike;
  try {
    event = verifier.webhooks.constructEvent(raw, signature, secret) as unknown as StripeEventLike;
  } catch {
    return errorResponse(400, "bad_signature", "Invalid signature.");
  }

  try {
    const result = await handleStripeEvent(event);
    if (result.mailKeys.length) after(() => deliverSoon(result.mailKeys));
    return json(result.body, result.status);
  } catch (error) {
    // 500 makes Stripe retry; the idempotency record was not written.
    console.error(`Stripe ${event.type} ${event.id} failed:`, error instanceof Error ? error.message : error);
    return errorResponse(500, "handler_failed", "Handler failed; Stripe will retry.");
  }
}
