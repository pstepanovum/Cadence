// FILE: src/app/api/auth/verify-email/route.ts
//
// POST: (re)sends the verify-email message for the signed-in account, from our
// template, with a link to our /verify-email page. Limited per account.
import { sendVerificationEmail } from "@/lib/server/account-events";
import { errorResponse, json } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Verify email", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const { uid, email, emailVerified } = guard.identity;
    if (!email) return errorResponse(400, "bad_request", "This account has no email address.");
    if (emailVerified) return json({ ok: true, alreadyVerified: true });
    const limit = await hitRateLimit(LIMITS.authEmailHour, `verify:${uid}`, { uid });
    if (!limit.allowed) return errorResponse(429, "rate_limited", "We just sent one. Check your inbox, or try again later.");
    await sendVerificationEmail(email);
    return json({ ok: true });
  });
}
