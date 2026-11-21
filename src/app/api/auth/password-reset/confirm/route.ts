// FILE: src/app/api/auth/password-reset/confirm/route.ts
//
// POST {token, password}: sets the new password (src/lib/server/password-reset.ts).
// One transaction claims the unexpired, unused link; then the password is
// set, every session revoked, and "Your password was changed" queued.
// Limited per IP and per token.
import { after } from "next/server";

import { deliverSoon, mailKey, queueMail } from "@/lib/server/email/queue";
import { db } from "@/lib/server/firebase";
import { clientIp, errorResponse, json, readJsonObject } from "@/lib/server/http";
import { completePasswordReset, hashResetToken, isResetTokenShape } from "@/lib/server/password-reset";
import { LIMITS, hitAll } from "@/lib/server/rate-limit";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGES = {
  invalid: "This reset link isn't valid. Request a new one.",
  expired: "This reset link has expired. Request a new one.",
  used: "This reset link has already been used. Request a new one if you need to.",
  weak_password: "Choose a password that meets every rule, and don't use your email address.",
} as const;

export function POST(request: Request) {
  return handled("Password reset confirm", async () => {
    const body = await readJsonObject(request, 2048).catch(() => null);
    const token = body?.token;
    const limit = await hitAll([
      { rule: LIMITS.resetConfirmIpHour, subject: clientIp(request) },
      ...(isResetTokenShape(token) ? [{ rule: LIMITS.resetConfirmTokenHour, subject: hashResetToken(token).slice(0, 32) }] : []),
    ]);
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many tries. Try again later.", { retryAfterSeconds: limit.retryAfterSeconds });

    const result = await completePasswordReset(token, body?.password);
    if (!result.ok) return errorResponse(result.reason === "weak_password" ? 400 : 410, result.reason, MESSAGES[result.reason]);

    const now = Date.now();
    // Remember the new token cutoff, so the next sign-in does not report this change a second time.
    await db().collection("users").doc(result.uid).set({ security: { tokensValidAfter: result.tokensValidAfter ?? now } }, { merge: true });
    const key = mailKey("password-changed", result.uid, String(result.tokensValidAfter ?? now));
    if (await queueMail(key, { template: "password-changed", uid: result.uid, props: { email: result.email, changedAt: now } })) after(() => deliverSoon([key]));
    return json({ ok: true });
  });
}
