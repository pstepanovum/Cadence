// FILE: src/app/api/sync/advanced/route.ts
//
// Plus only (docs/PLATFORM.md section 20): phrase and slang review state, the
// plateau track and recording metadata (never audio), one document per
// account.
//   GET   the merged state
//   POST  {installId, cards?, track?, recordings?: {upsert, remove}}: merged
//         last-writer-wins per card, the newer track, metadata by id; answers
//         the merged state
// A free account gets 402 needs_plus and keeps all of it on the device.
import { getAccount } from "@/lib/server/entitlement";
import { mergeAdvanced, parseAdvancedPush, readAdvanced } from "@/lib/server/mcp-teacher-store";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { hitAll, LIMITS } from "@/lib/server/rate-limit";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEEDS_PLUS = "Syncing phrase reviews, the plateau track and recordings across devices needs Cadence Plus. They stay on this device.";

export function GET(request: Request) {
  return handled("Advanced pull", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    if (!(await getAccount(guard.identity.uid)).isPlus) return errorResponse(402, "needs_plus", NEEDS_PLUS, { tier: "summary" });
    return json(await readAdvanced(guard.identity.uid));
  });
}

export function POST(request: Request) {
  return handled("Advanced push", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const uid = guard.identity.uid;
    if (!(await getAccount(uid)).isPlus) return errorResponse(402, "needs_plus", NEEDS_PLUS, { tier: "summary" });
    const limited = await hitAll([{ rule: LIMITS.syncUserMinute, subject: `advanced:${uid}`, uid }]);
    if (!limited.allowed) return errorResponse(429, "rate_limited", "Too many syncs. Try again shortly.", { retryAfterSeconds: limited.retryAfterSeconds });
    const parsed = parseAdvancedPush(await readJsonObject(request, 1024 * 1024).catch(() => null));
    if (!parsed.ok) return errorResponse(400, "bad_request", parsed.message);
    return json(await mergeAdvanced(uid, parsed.push));
  });
}
