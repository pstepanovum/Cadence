// FILE: src/app/api/billing/checkout/route.ts
//
// POST {interval: "monthly" | "yearly"} -> {url} of a Stripe Checkout session
// for Cadence Plus. Signed-in web accounts only; the yearly plan carries a
// 7-day trial for a customer who never had one.
import { CheckoutError, createCheckoutSession, isPlusInterval } from "@/lib/server/billing/checkout";
import { isStripeKeyConfigured } from "@/lib/server/billing/stripe-client";
import { errorResponse, isSameOrigin, json, readJsonObject } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<CheckoutError["code"], number> = { already_plus: 409, price_missing: 503, no_customer: 404, not_configured: 503 };

export function POST(request: Request) {
  return handled("Checkout", async () => {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden", "Cross-site request refused.");
    if (!isStripeKeyConfigured()) return errorResponse(503, "not_configured", "Billing isn't set up on this server.");
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    const body = await readJsonObject(request, 4096).catch(() => null);
    const interval = body?.interval;
    if (!isPlusInterval(interval)) return errorResponse(400, "bad_request", "interval must be monthly or yearly.");
    try {
      const session = await createCheckoutSession({ uid: guard.identity.uid, email: guard.identity.email, interval });
      return json(session);
    } catch (caught) {
      if (caught instanceof CheckoutError) return errorResponse(STATUS[caught.code], caught.code, caught.message);
      throw caught;
    }
  });
}
