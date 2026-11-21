// FILE: src/app/api/auth/password-reset/check/route.ts
//
// POST {token}: whether a reset link still works, for the reset page:
// {state: "valid", email: "m***@example.com"} or {state: "expired" | "used" | "invalid"}.
// The token travels in the body, not the URL, so it stays out of request logs.
import { clientIp, errorResponse, json, readJsonObject } from "@/lib/server/http";
import { checkPasswordReset } from "@/lib/server/password-reset";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Password reset check", async () => {
    const limit = await hitRateLimit(LIMITS.resetCheckIpHour, clientIp(request));
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many requests. Try again later.");
    const body = await readJsonObject(request, 1024).catch(() => null);
    return json(await checkPasswordReset(body?.token));
  });
}
