// FILE: src/app/api/sync/summary/route.ts
//
// POST {activities: Activity[]} (at most 50): applied to the one summary
// document every signed-in account has, in one transaction. GET returns it.
// This is all a free account keeps in the cloud. One read and one write per
// round, rate limit included (syncSummary).
import { parseActivities } from "@/lib/server/sync-input";
import { getSummary, syncSummary } from "@/lib/server/sync";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Summary read", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    return json({ summary: await getSummary(guard.identity.uid) });
  });
}

export function POST(request: Request) {
  return handled("Summary sync", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const parsed = parseActivities(await readJsonObject(request, 64 * 1024).catch(() => null));
    if (!parsed.ok) return errorResponse(400, "bad_request", parsed.error);
    // The rate limit is checked in the same transaction (one read, one write).
    const result = await syncSummary(guard.identity.uid, parsed.value);
    if (!result.ok) return errorResponse(429, "rate_limited", "Too many syncs. Try again shortly.", { retryAfterSeconds: result.retryAfterSeconds });
    return json({ summary: result.summary });
  });
}
