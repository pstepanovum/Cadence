// FILE: src/app/api/practice/route.ts
//
// The practice list the learner's assistant assigned through the connector,
// and (for a free account) the drill results it logged, waiting for a device
// (docs/PLATFORM.md section 20). Every signed-in account.
//   GET    {list, reviews}
//   PATCH  {reviewsUpTo?: number, done?: string[]}  acknowledges reviews up to a
//          time and removes finished items from the list
import { acknowledgePractice, readPractice } from "@/lib/server/mcp-teacher-store";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Practice inbox read", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    return json(await readPractice(guard.identity.uid));
  });
}

export function PATCH(request: Request) {
  return handled("Practice inbox acknowledge", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const body = await readJsonObject(request, 32 * 1024).catch(() => null);
    const reviewsUpTo = body?.reviewsUpTo;
    const done = body?.done;
    if (reviewsUpTo !== undefined && !Number.isFinite(reviewsUpTo)) return errorResponse(400, "bad_request", "reviewsUpTo must be a time in milliseconds.");
    if (done !== undefined && (!Array.isArray(done) || done.length > 200 || !done.every((id) => typeof id === "string" && id.length <= 140))) return errorResponse(400, "bad_request", "done must be a list of item ids.");
    return json(await acknowledgePractice(guard.identity.uid, { reviewsUpTo: reviewsUpTo as number | undefined, done: done as string[] | undefined }));
  });
}
