// FILE: src/app/api/me/route.ts
//
// GET: the signed-in account as every client needs it (src/lib/server/me.ts):
// profile basics, Plus (resolved server-side from verified webhooks only), the
// data tier, and today's cloud AI quota. Clients never write entitlement;
// this is where they read it.
import { after } from "next/server";

import { noteSignIn } from "@/lib/server/account-events";
import { deliverSoon } from "@/lib/server/email/queue";
import { getAccount } from "@/lib/server/entitlement";
import { isHostedCloud } from "@/lib/server/env";
import { db } from "@/lib/server/firebase";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { loadMe } from "@/lib/server/me";
import { handled, requireCloudUser } from "@/lib/server/route";

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
    return json(await loadMe(guard.identity, { hosted: isHostedCloud() }));
  });
}

/**
 * PATCH {reminders?: boolean, lifecycle?: boolean}: email choices that live on
 * the account. Practice reminders are opt-in; the getting-started tips are on
 * until turned off. The newsletter has its own route (double opt-in).
 */
export function PATCH(request: Request) {
  return handled("Email preferences", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const body = await readJsonObject(request, 1024).catch(() => null);
    const patch: Record<string, boolean> = {};
    for (const key of ["reminders", "lifecycle"] as const) {
      if (body?.[key] === undefined) continue;
      if (typeof body[key] !== "boolean") return errorResponse(400, "bad_request", `${key} must be true or false.`);
      patch[key] = body[key] as boolean;
    }
    if (Object.keys(patch).length === 0) return errorResponse(400, "bad_request", "Send reminders or lifecycle as true or false.");
    await db().collection("users").doc(guard.identity.uid).set({ emailPrefs: patch }, { merge: true });
    return json({ emailPrefs: { ...(await getAccount(guard.identity.uid)).emailPrefs } });
  });
}
