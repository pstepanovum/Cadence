// FILE: src/app/api/webhooks/revenuecat/route.ts
//
// POST https://cadence.pstepanov.dev/api/webhooks/revenuecat
//
// Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>, as set in the RevenueCat
// dashboard, compared in constant time; anything else is 401. Idempotent by
// event id (webhookEvents/revenuecat:<id>). Handles INITIAL_PURCHASE, RENEWAL,
// CANCELLATION, UNCANCELLATION, EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE,
// TRANSFER, SUBSCRIPTION_PAUSED and TEST.
import { after } from "next/server";

import { handleRevenueCatEvent, isAuthorizedRevenueCat, parseRevenueCatBody } from "@/lib/server/billing/revenuecat";
import { deliverSoon } from "@/lib/server/email/queue";
import { BodyTooLargeError, errorResponse, json, readTextCapped } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.REVENUECAT_WEBHOOK_SECRET?.trim()) return errorResponse(500, "not_configured", "RevenueCat webhooks are not configured.");
  if (!isAuthorizedRevenueCat(request.headers.get("authorization"))) return errorResponse(401, "unauthorized", "Bad authorization.");

  let event;
  try {
    event = parseRevenueCatBody(JSON.parse(await readTextCapped(request, 256 * 1024)));
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return errorResponse(413, "too_large", "Body too large.");
    return errorResponse(400, "bad_request", "Body is not JSON.");
  }
  if (!event) return errorResponse(400, "bad_request", "Missing event.");

  try {
    const result = await handleRevenueCatEvent(event);
    if (result.mailKeys.length) after(() => deliverSoon(result.mailKeys));
    return json(result.body, result.status);
  } catch (error) {
    console.error(`RevenueCat ${event.type} ${event.id} failed:`, error instanceof Error ? error.message : error);
    return errorResponse(500, "handler_failed", "Handler failed; RevenueCat will retry.");
  }
}
