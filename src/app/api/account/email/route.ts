// FILE: src/app/api/account/email/route.ts
//
// POST {newEmail}: starts a sign-in email change. Firebase makes the one-time
// code; our verify-email template carries it to the new address, pointing at
// our own /verify-email page. The change happens when the link is opened, and
// the next sign-in sends email-changed to both addresses. Needs a recent sign-in.
import { ownActionLink } from "@/lib/server/account-events";
import { sendEmail } from "@/lib/server/email/brevo";
import { isEmailAddress } from "@/lib/server/email/senders";
import { renderTemplate } from "@/lib/server/email/templates/index";
import { appOrigin } from "@/lib/server/env";
import { auth } from "@/lib/server/firebase";
import { errorResponse, isSameOrigin, json, readJsonObject } from "@/lib/server/http";
import { isRecentAuth } from "@/lib/server/identity";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Email change", async () => {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden", "Cross-site request refused.");
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    const { uid, email } = guard.identity;
    if (!isRecentAuth(guard.identity)) return errorResponse(401, "reauth_required", "Sign in again to change your email.");
    const limit = await hitRateLimit(LIMITS.authEmailHour, `change:${uid}`, { uid });
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many attempts. Try again later.");
    const body = await readJsonObject(request, 4096).catch(() => null);
    const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    if (!isEmailAddress(newEmail) || !email) return errorResponse(400, "bad_request", "Enter a valid email address.");
    if (newEmail === email.toLowerCase()) return errorResponse(400, "bad_request", "That's already your email.");
    try {
      const link = await auth().generateVerifyAndChangeEmailLink(email, newEmail, { url: `${appOrigin()}/login` });
      await sendEmail({ to: { email: newEmail }, email: renderTemplate("verify-email", { email: newEmail, verifyUrl: ownActionLink(link, "/verify-email") }), tags: ["verify-email"] });
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code.includes("email-already-exists")) return errorResponse(409, "email_taken", "That address belongs to another account.");
      throw error;
    }
    return json({ ok: true, sentTo: newEmail });
  });
}
