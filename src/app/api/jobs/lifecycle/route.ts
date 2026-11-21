// FILE: src/app/api/jobs/lifecycle/route.ts
//
// POST, from Cloud Scheduler every hour with `Authorization: Bearer <JOBS_SECRET>`:
// the getting-started and offer emails for new accounts without Plus, each in
// the learner's local evening. See src/lib/server/lifecycle.ts.
import { errorResponse, json } from "@/lib/server/http";
import { isJobAuthorized } from "@/lib/server/jobs";
import { runLifecycleJob } from "@/lib/server/lifecycle";
import { handled } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function POST(request: Request) {
  return handled("Lifecycle job", async () => {
    if (!isJobAuthorized(request.headers.get("authorization"))) return errorResponse(401, "unauthorized", "Not allowed.");
    return json(await runLifecycleJob());
  });
}
