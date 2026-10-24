// FILE: src/app/api/jobs/daily/route.ts
//
// POST, from Cloud Scheduler once a day with `Authorization: Bearer <JOBS_SECRET>`.
// See src/lib/server/jobs.ts for what it does.
import { errorResponse, json } from "@/lib/server/http";
import { isJobAuthorized, runDailyJob } from "@/lib/server/jobs";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function POST(request: Request) {
  return handled("Daily job", async () => {
    if (!isJobAuthorized(request.headers.get("authorization"))) return errorResponse(401, "unauthorized", "Not allowed.");
    return json(await runDailyJob());
  });
}
