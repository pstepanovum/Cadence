// FILE: src/app/checkout/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/app-session";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Starting your trial",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const appSession = await getAppSession();

  if (appSession.mode !== "cloud") {
    redirect("/setup");
  }

  if (!appSession.user) {
    redirect("/signup");
  }

  const meta = appSession.user.meta;

  // Already on an active subscription — skip straight to the right page
  const status = meta.stripe_subscription_status as string | undefined;
  if (status === "active" || status === "trialing") {
    redirect(appSession.user.onboardingCompleted ? "/dashboard" : "/onboarding");
  }

  // Stripe not configured (local dev without keys) — skip to onboarding
  if (!isStripeConfigured()) {
    redirect("/onboarding");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`;

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: appSession.user.email ?? undefined,
    client_reference_id: appSession.user.id,
    subscription_data: {
      trial_period_days: 7,
      metadata: {
        supabase_user_id: appSession.user.id,
      },
    },
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    success_url: `${appUrl}/onboarding?checkout=success`,
    cancel_url: `${appUrl}/`,
  });

  redirect(stripeSession.url!);
}
