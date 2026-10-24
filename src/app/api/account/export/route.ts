// FILE: src/app/api/account/export/route.ts
//
// GET: everything Cadence keeps about the signed-in account, as a JSON file
// download. Offered before deletion.
import { exportAccount } from "@/lib/server/account";
import { errorResponse } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Account export", async () => {
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    const uid = guard.identity.uid;
    const limit = await hitRateLimit(LIMITS.exportUserHour, uid, { uid });
    if (!limit.allowed) return errorResponse(429, "rate_limited", "Try the download again in a little while.", { retryAfterSeconds: limit.retryAfterSeconds });
    const data = await exportAccount(uid);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cadence-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
