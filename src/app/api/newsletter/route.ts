// FILE: src/app/api/newsletter/route.ts
//
// POST, two shapes:
//   {email, consent: true, platform?}   the site's signup form, anyone
//   {subscribed: true|false}            the app's toggle, signed-in accounts,
//                                       for the account's own address
// Subscribing starts Brevo's double opt-in (list 5); nobody is added before
// they click the confirmation. Needs App Check with replay protection and
// stays under per-IP and per-address limits. A signed-in subscriber's PLAN,
// PLATFORM and CEFR_LEVEL go along as contact attributes. Unsubscribing
// removes the address from list 5 at once.
import { requireAppCheck } from "@/lib/server/app-check";
import { BREVO_LISTS, removeFromList } from "@/lib/server/email/brevo";
import { db } from "@/lib/server/firebase";
import { getAccount } from "@/lib/server/entitlement";
import { isEmailAddress } from "@/lib/server/email/senders";
import { clientIp, errorResponse, json, readJsonObject } from "@/lib/server/http";
import { cloudIdentity } from "@/lib/server/identity";
import { doiTemplateId, subscribe } from "@/lib/server/newsletter";
import { LIMITS, hitAll } from "@/lib/server/rate-limit";
import { handled } from "@/lib/server/route";
import { getSummary } from "@/lib/server/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Newsletter", async () => {
    if (!doiTemplateId()) return errorResponse(503, "not_configured", "The newsletter isn't set up yet.");
    const check = await requireAppCheck(request, { consume: true });
    if (!check.ok) return check.response;

    const body = await readJsonObject(request, 2048).catch(() => null);
    const identity = await cloudIdentity(request);
    const toggle = typeof body?.subscribed === "boolean";
    if (toggle && !identity?.email) return errorResponse(401, "unauthorized", "Sign in to change your newsletter choice.");
    const email = toggle ? (identity?.email ?? "").toLowerCase() : typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isEmailAddress(email)) return errorResponse(400, "bad_request", "Enter a valid email address.");
    if (toggle && body?.subscribed === false) {
      await removeFromList(email, BREVO_LISTS.newsletter);
      await db().collection("users").doc(identity!.uid).set({ emailPrefs: { newsletter: false } }, { merge: true });
      return json({ ok: true, subscribed: false });
    }
    // The app's toggle is the explicit opt-in; the site's form sends consent.
    if (!toggle && body?.consent !== true) return errorResponse(400, "consent_required", "Tick the box to say you'd like the newsletter.");

    const limit = await hitAll([
      { rule: LIMITS.newsletterIpHour, subject: clientIp(request) },
      { rule: LIMITS.newsletterEmailDay, subject: email },
    ]);
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many requests. Try again later.", { retryAfterSeconds: limit.retryAfterSeconds });

    const platform = typeof body?.platform === "string" && /^(web|ios|android|desktop)$/.test(body.platform) ? body.platform : toggle ? "ios" : "web";
    const attributes: Record<string, string> = { PLATFORM: platform };
    if (identity && identity.email?.toLowerCase() === email) {
      const [account, summary] = await Promise.all([getAccount(identity.uid), getSummary(identity.uid)]);
      attributes.PLAN = account.isPlus ? "plus" : "free";
      if (summary.placementLevel) attributes.CEFR_LEVEL = summary.placementLevel;
    }

    await subscribe(email, attributes);
    return json({ ok: true, pending: true, message: "Check your inbox to confirm." });
  });
}
