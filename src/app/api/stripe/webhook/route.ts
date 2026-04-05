// FILE: src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Helper: merge stripe fields into user_metadata without clobbering existing keys
async function updateSubscriptionMeta(
  userId: string,
  fields: Record<string, unknown>,
) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  const existing = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...existing, ...fields },
  });
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
    event = stripe.webhooks.constructEvent(
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

        await updateSubscriptionMeta(userId, {
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          stripe_subscription_status: "trialing",
        });
        break;
      }

      // ── Subscription status changed (trial → active, canceled, etc.) ────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const trialEnd = sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null;

        await updateSubscriptionMeta(userId, {
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          stripe_subscription_status: sub.status,
          stripe_trial_end: trialEnd,
        });
        break;
      }

      // ── Subscription canceled ────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await updateSubscriptionMeta(userId, {
          stripe_subscription_status: "canceled",
          stripe_subscription_id: sub.id,
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

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await updateSubscriptionMeta(userId, {
          stripe_subscription_status: sub.status,
        });
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

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await updateSubscriptionMeta(userId, {
          stripe_subscription_status: "past_due",
        });
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
