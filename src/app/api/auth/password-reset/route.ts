// FILE: src/app/api/auth/password-reset/route.ts
//
// POST {email}: sends Cadence's own password-reset email. Firebase makes the
// one-time code (generatePasswordResetLink); the link in the email opens our
// /reset-password page, never Firebase's default page, and the email is ours,
// never Firebase's. Always answers 200 the same way, so it says nothing about
// which addresses have accounts. Limited per IP and per address.
import { ownActionLink } from "@/lib/server/account-events";
import { requireAppCheck } from "@/lib/server/app-check";
import { sendEmail } from "@/lib/server/email/brevo";
import { isEmailAddress } from "@/lib/server/email/senders";
import { renderTemplate } from "@/lib/server/email/templates/index";
import { appOrigin } from "@/lib/server/env";
import { auth } from "@/lib/server/firebase";
import { clientIp, errorResponse, json, readJsonObject } from "@/lib/server/http";
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

    let link: string;
    try {
      link = await auth().generatePasswordResetLink(email, { url: `${appOrigin()}/login` });
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code.includes("user-not-found") || code.includes("email-not-found") || code.includes("invalid-email")) return json(SAME_ANSWER);
      throw error;
    }
    // Sent directly, not queued: the link is a credential and is not stored anywhere.
    await sendEmail({ to: { email }, email: renderTemplate("password-reset", { email, resetUrl: ownActionLink(link, "/reset-password"), expiresInMinutes: 60 }), tags: ["password-reset"] });
    return json(SAME_ANSWER);
  });
}
