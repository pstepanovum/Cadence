// FILE: src/app/api/sync/pull/route.ts
//
// Plus only. GET ?since=<cursor ms>: everything changed since the cursor
// (SRS decks, mastery, attempt days, coach sessions) and the next cursor.
import { TierError, pullDetail } from "@/lib/server/sync";
import { errorResponse, json } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Detail pull", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const since = Number(new URL(request.url).searchParams.get("since") ?? "0");
    if (!Number.isFinite(since) || since < 0) return errorResponse(400, "bad_request", "since must be a cursor from an earlier pull.");
    try {
      return json(await pullDetail(guard.identity.uid, since));
    } catch (caught) {
      if (caught instanceof TierError) return errorResponse(402, "needs_plus", caught.message, { tier: "summary" });
      throw caught;
    }
  });
}
