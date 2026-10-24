// FILE: src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { updateBilling } from "@/lib/cloud/store";

/** Checkout tags each subscription with the Firebase uid it belongs to. */
function uidOf(sub: Stripe.Subscription) {
  return sub.metadata?.firebase_uid || null;
}

function idOf(value: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Trial started / checkout completed ──────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) break;

        await updateBilling(userId, {
          stripeCustomerId: idOf(session.customer),
          stripeSubscriptionId: idOf(session.subscription),
          status: "trialing",
        });
        break;
      }

      // ── Subscription status changed (trial → active, canceled, etc.) ────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = uidOf(sub);
        if (!userId) break;

        await updateBilling(userId, {
          stripeCustomerId: idOf(sub.customer),
          stripeSubscriptionId: sub.id,
          status: sub.status,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        });
        break;
      }

      // ── Subscription canceled ────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = uidOf(sub);
        if (!userId) break;

        await updateBilling(userId, {
          status: "canceled",
          stripeSubscriptionId: sub.id,
        });
        break;
      }

      // ── Payment succeeded ────────────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          invoice.parent?.type === "subscription_details"
            ? (invoice.parent.subscription_details?.subscription as string | undefined)
            : undefined;
        if (!subscriptionId) break;

        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        const userId = uidOf(sub);
        if (!userId) break;

        await updateBilling(userId, { status: sub.status });
        break;
      }

      // ── Payment failed ───────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          invoice.parent?.type === "subscription_details"
            ? (invoice.parent.subscription_details?.subscription as string | undefined)
            : undefined;
        if (!subscriptionId) break;

        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        const userId = uidOf(sub);
        if (!userId) break;

        await updateBilling(userId, { status: "past_due" });
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
