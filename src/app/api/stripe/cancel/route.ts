// FILE: src/app/api/stripe/cancel/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAppSession } from "@/lib/app-session";
import { readBearerToken } from "@/lib/auth/bearer";
import { updateBilling } from "@/lib/cloud/store";
import { getRequestRuntimeFromRequest } from "@/lib/runtime/request-runtime";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as
      | { action?: string }
      | null;
    const action = payload?.action;

    if (action !== "cancel" && action !== "resume") {
      return NextResponse.json(
        { error: "Invalid subscription action." },
        { status: 400 },
      );
    }

    if (shouldProxyDesktopBillingRequest(request)) {
      return proxyDesktopBillingRequest(request, { action });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe billing is not configured yet." },
        { status: 503 },
      );
    }

    // A Bearer ID token (the desktop proxy, the phone) or the session cookie.
    const session = await getAppSession();

    if (session.mode !== "cloud" || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscriptionId = session.user.billing?.stripeSubscriptionId;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found." },
        { status: 400 },
      );
    }

    const updated = await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: action === "cancel",
    });

    let metadataSynced = true;

    try {
      // Record the change now instead of waiting for the webhook.
      await updateBilling(session.user.id, {
        cancelAtPeriodEnd: updated.cancel_at_period_end,
        cancelAt: updated.cancel_at ? new Date(updated.cancel_at * 1000).toISOString() : null,
      });
    } catch (billingError) {
      metadataSynced = false;
      console.error("Stripe subscription billing sync error:", billingError);
    }

    return NextResponse.json({
      cancel_at_period_end: updated.cancel_at_period_end,
      cancel_at: updated.cancel_at,
      metadataSynced,
    });
  } catch (err) {
    console.error("Stripe cancel error:", err);
    return NextResponse.json(
      { error: getSubscriptionUpdateErrorMessage(err) },
      { status: 500 },
    );
  }
}

function getSubscriptionUpdateErrorMessage(error: unknown) {
  // Stripe's own message can name ids and account details; it is logged above.
  if (error instanceof Stripe.errors.StripeCardError) return error.message;
  return "The subscription couldn't be updated. Try again, or manage it from the billing portal.";
}

function shouldProxyDesktopBillingRequest(request: Request) {
  if (getRequestRuntimeFromRequest(request) !== "desktop") {
    return false;
  }

  return new URL(request.url).origin !== getHostedBillingOrigin();
}

async function proxyDesktopBillingRequest(
  request: Request,
  payload: { action: "cancel" | "resume" },
) {
  const accessToken = readBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return NextResponse.json(
      {
        error:
          "Your desktop session needs to be refreshed before billing can update. Please sign in again and retry.",
      },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(`${getHostedBillingOrigin()}/api/stripe/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const responseBody = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      return NextResponse.json(responseBody ?? {}, { status: response.status });
    }

    const text = await response.text();
    return NextResponse.json(
      {
        error:
          text.trim() ||
          "The hosted billing service returned an unexpected response.",
      },
      { status: response.status },
    );
  } catch (error) {
    return NextResponse.json(
      { error: getSubscriptionUpdateErrorMessage(error) },
      { status: 503 },
    );
  }
}

function getHostedBillingOrigin() {
  return (
    process.env.CADENCE_HOSTED_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://cadence.pstepanov.dev"
  ).replace(/\/$/, "");
}
