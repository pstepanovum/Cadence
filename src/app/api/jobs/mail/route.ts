// FILE: src/app/api/jobs/mail/route.ts
//
// POST, from Cloud Scheduler every five minutes with `Authorization: Bearer <JOBS_SECRET>`:
// delivers queued email that the request that queued it did not get out.
import { deliverPending } from "@/lib/server/email/queue";
import { errorResponse, json } from "@/lib/server/http";
import { isJobAuthorized } from "@/lib/server/jobs";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function POST(request: Request) {
  return handled("Mail job", async () => {
    if (!isJobAuthorized(request.headers.get("authorization"))) return errorResponse(401, "unauthorized", "Not allowed.");
    return json(await deliverPending());
  });
}
