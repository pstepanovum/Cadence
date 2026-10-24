// FILE: src/app/api/auth/password-changed/route.ts
//
// POST {email}: the reset page calls this after confirmPasswordReset succeeds.
// The password-changed email is queued only if Firebase really shows a new
// password for that account in the last 15 minutes, so a caller cannot send
// it to anyone. Always 200.
import { after } from "next/server";

import { notePasswordChanged } from "@/lib/server/account-events";
import { deliverSoon } from "@/lib/server/email/queue";
import { isEmailAddress } from "@/lib/server/email/senders";
import { clientIp, errorResponse, json, readJsonObject } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Password changed", async () => {
    const limit = await hitRateLimit(LIMITS.authIpHour, clientIp(request));
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many requests. Try again later.");
    const body = await readJsonObject(request, 2048).catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (isEmailAddress(email)) {
      const keys = await notePasswordChanged(email);
      if (keys.length) after(() => deliverSoon(keys));
    }
    return json({ ok: true });
  });
}
