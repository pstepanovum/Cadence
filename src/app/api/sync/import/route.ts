// FILE: src/app/api/sync/import/route.ts
//
// Plus only. The one-time upload of a device's local detail when Plus first
// becomes active, same body as /api/sync/push. Idempotent per installId: a
// second import from the same install answers {alreadyImported: true}.
import { after } from "next/server";

import { deliverSoon, mailKey } from "@/lib/server/email/queue";
import { parsePush } from "@/lib/server/sync-input";
import { TierError, pushDetail } from "@/lib/server/sync";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Detail import", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const uid = guard.identity.uid;
    const limit = await hitRateLimit(LIMITS.syncUserMinute, uid, { uid });
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Too many syncs. Try again shortly.", { retryAfterSeconds: limit.retryAfterSeconds });
    const parsed = parsePush(await readJsonObject(request, 4 * 1024 * 1024).catch(() => null));
    if (!parsed.ok) return errorResponse(400, "bad_request", parsed.error);
    try {
      const result = await pushDetail(uid, parsed.value, { importing: true });
      if (result.newDevice) after(() => deliverSoon([mailKey("device", uid, parsed.value.installId)]));
      return json(result);
    } catch (caught) {
      if (caught instanceof TierError) return errorResponse(402, "needs_plus", caught.message, { tier: "summary" });
      throw caught;
    }
  });
}
