// FILE: src/app/api/auth/password-reset/route.ts
//
// POST {email}: starts Cadence's own password reset (src/lib/server/password-reset.ts).
// A password account gets our link to /reset-password?token=…, an Apple or
// Google account a note that it has no password, an unknown address nothing.
// The work happens after the response, and the answer is always the same,
// so neither the words nor the timing say which addresses have accounts.
// Limited per IP and per address. The web form and the iPhone app both call it.
import { after } from "next/server";

import { requireAppCheck } from "@/lib/server/app-check";
import { isEmailAddress } from "@/lib/server/email/senders";
import { clientIp, errorResponse, json, readJsonObject } from "@/lib/server/http";
import { issuePasswordReset } from "@/lib/server/password-reset";
import { deliverResetPlan } from "@/lib/server/password-reset-mail";
import { LIMITS, hitAll } from "@/lib/server/rate-limit";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAME_ANSWER = { ok: true, message: "If that address has a Cadence account, a reset link is on its way." };

export function POST(request: Request) {
  return handled("Password reset", async () => {
    const check = await requireAppCheck(request);
    if (!check.ok) return check.response;
    const body = await readJsonObject(request, 2048).catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isEmailAddress(email)) return errorResponse(400, "bad_request", "Enter a valid email address.");

    const limit = await hitAll([
      { rule: LIMITS.authIpHour, subject: clientIp(request) },
      { rule: LIMITS.authEmailHour, subject: `reset:${email}` },
    ]);
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many requests. Try again later.", { retryAfterSeconds: limit.retryAfterSeconds });

    after(async () => {
      try {
        await deliverResetPlan(await issuePasswordReset(email));
      } catch (error) {
        console.error("Password reset failed:", error instanceof Error ? error.message : error);
      }
    });
    return json(SAME_ANSWER);
  });
}
