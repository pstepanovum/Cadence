// FILE: src/app/api/billing/portal/route.ts
//
// POST -> {url} of the Stripe Customer Portal for the signed-in account, to
// change the card, switch plans or cancel. Returns to /account.
import { CheckoutError, createPortalSession } from "@/lib/server/billing/checkout";
import { isStripeKeyConfigured } from "@/lib/server/billing/stripe-client";
import { errorResponse, isSameOrigin, json } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Portal", async () => {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden", "Cross-site request refused.");
    if (!isStripeKeyConfigured()) return errorResponse(503, "not_configured", "Billing isn't set up on this server.");
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    try {
      return json(await createPortalSession({ uid: guard.identity.uid }));
    } catch (caught) {
      if (caught instanceof CheckoutError) return errorResponse(404, caught.code, caught.message);
      throw caught;
    }
  });
}
