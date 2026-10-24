// FILE: src/app/api/me/route.ts
//
// GET: the signed-in account as every client needs it: profile basics, Plus
// (resolved server-side from verified webhooks only), the data tier, and
// today's cloud AI quota. Clients never write entitlement; this is where
// they read it.
import { after } from "next/server";

import { dataTier } from "@/lib/platform/engine-routing";
import { noteSignIn } from "@/lib/server/account-events";
import { deliverSoon } from "@/lib/server/email/queue";
import { getAccount } from "@/lib/server/entitlement";
import { isHostedCloud } from "@/lib/server/env";
import { db } from "@/lib/server/firebase";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { isBreakerTripped, quotaSummary, todaysUsage } from "@/lib/server/quota";
import { handled, requireCloudUser } from "@/lib/server/route";
import { getSummary } from "@/lib/server/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Me", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const { uid, email, emailVerified } = guard.identity;
    // The phone signs in with the Firebase SDK and has no session cookie, so a
    // fresh sign-in is noticed here instead (once per sign-in).
    if (guard.identity.via === "id-token" && Date.now() / 1000 - guard.identity.authTime < 600) {
      const context = { uid, email, emailVerified, userAgent: request.headers.get("user-agent"), authTime: guard.identity.authTime };
      after(async () => {
        try {
          await deliverSoon(await noteSignIn(context));
        } catch (error) {
          console.error("Sign-in notices failed:", error instanceof Error ? error.message : error);
        }
      });
    }
    const [account, usage, summary, paused] = await Promise.all([getAccount(uid), todaysUsage(uid), getSummary(uid), isHostedCloud() ? isBreakerTripped() : Promise.resolve(false)]);
    return json({
      uid,
      email,
      emailVerified,
      displayName: account.displayName,
      plus: account.plus,
      isPlus: account.isPlus,
      tier: dataTier(true, account.isPlus),
      cloudAi: isHostedCloud() && account.isPlus,
      quota: { ...quotaSummary(usage), paused },
      cloudPaused: paused,
      newsletter: account.emailPrefs.newsletter,
      detailPurgeAt: account.detailPurgeAt,
      emailPrefs: account.emailPrefs,
      summary,
    });
  });
}

/** PATCH {reminders: boolean}: practice reminders and summaries are opt-in. */
export function PATCH(request: Request) {
  return handled("Email preferences", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const body = await readJsonObject(request, 1024).catch(() => null);
    if (typeof body?.reminders !== "boolean") return errorResponse(400, "bad_request", "reminders must be true or false.");
    await db().collection("users").doc(guard.identity.uid).set({ emailPrefs: { reminders: body.reminders } }, { merge: true });
    return json({ emailPrefs: { ...(await getAccount(guard.identity.uid)).emailPrefs } });
  });
}
