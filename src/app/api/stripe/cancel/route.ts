// FILE: src/app/api/stripe/cancel/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const subscriptionId = meta.stripe_subscription_id as string | undefined;

  if (!subscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  const { action } = await request.json() as { action: "cancel" | "resume" };

  try {
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: action === "cancel",
    });

    // Sync state back to user metadata immediately (don't wait for webhook)
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.getUserById(user.id);
    const existing = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...existing,
        stripe_cancel_at_period_end: updated.cancel_at_period_end,
        stripe_cancel_at: updated.cancel_at
          ? new Date(updated.cancel_at * 1000).toISOString()
          : null,
      },
    });

    return NextResponse.json({
      cancel_at_period_end: updated.cancel_at_period_end,
      cancel_at: updated.cancel_at,
    });
  } catch (err) {
    console.error("Stripe cancel error:", err);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}
