// FILE: src/app/api/auth/sign-in-failed/route.ts
//
// POST {email}: the sign-in forms report a failed password sign-in (Firebase
// signs in from the client, so the server would not otherwise know). Past ten
// failures for one address in an hour, the account holder gets one
// suspicious-activity email a day. Counted per address and per IP; always 200.
import { after } from "next/server";

import { deliverSoon, mailKey, queueMail } from "@/lib/server/email/queue";
import { isEmailAddress } from "@/lib/server/email/senders";
import { auth } from "@/lib/server/firebase";
import { clientIp, json, readJsonObject } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERT_AT = 10;

export function POST(request: Request) {
  return handled("Sign-in failure", async () => {
    const ip = await hitRateLimit(LIMITS.authIpHour, `failed:${clientIp(request)}`);
    const body = await readJsonObject(request, 2048).catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!ip.allowed || !isEmailAddress(email)) return json({ ok: true });

    const count = await hitRateLimit({ name: "signin-failed-email-hour", limit: 1000, windowSeconds: 3600 }, email);
    if (count.count === ALERT_AT) {
      try {
        const user = await auth().getUserByEmail(email);
        const key = mailKey("suspicious", user.uid, new Date().toISOString().slice(0, 10));
        if (await queueMail(key, { template: "suspicious-activity", uid: user.uid, props: { summary: `${ALERT_AT} failed sign-ins in under an hour`, at: Date.now() } })) {
          after(() => deliverSoon([key]));
        }
      } catch {
        // No such account: nothing to tell anyone.
      }
    }
    return json({ ok: true });
  });
}
