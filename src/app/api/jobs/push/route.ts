// FILE: src/app/api/jobs/push/route.ts
//
// POST {uids, title, body, url?} with `Authorization: Bearer <JOBS_SECRET>`:
// the stub future push campaigns go through (src/lib/server/push.ts). Not
// scheduled anywhere yet.
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { isJobAuthorized } from "@/lib/server/jobs";
import { sendCampaign } from "@/lib/server/push";
import { parseCampaign } from "@/lib/server/push-messages";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function POST(request: Request) {
  return handled("Push campaign", async () => {
    if (!isJobAuthorized(request.headers.get("authorization"))) return errorResponse(401, "unauthorized", "Not allowed.");
    const parsed = parseCampaign(await readJsonObject(request, 64 * 1024).catch(() => null));
    if (!parsed.ok) return errorResponse(400, "bad_request", parsed.message);
    return json(await sendCampaign(parsed.uids, parsed.campaign));
  });
}
