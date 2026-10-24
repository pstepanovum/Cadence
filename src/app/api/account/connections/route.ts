// FILE: src/app/api/account/connections/route.ts
//
// The MCP connections a learner approved. GET lists them; DELETE {grantId}
// disconnects one at once (its tokens stop working on the next call).
import { listGrantsForUid, revokeGrantForUid } from "@/lib/oauth/store";
import { errorResponse, isSameOrigin, json, readJsonObject } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Connections", async () => {
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    return json({ connections: await listGrantsForUid(guard.identity.uid) });
  });
}

export function DELETE(request: Request) {
  return handled("Disconnect", async () => {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden", "Cross-site request refused.");
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    const body = await readJsonObject(request, 1024).catch(() => null);
    const grantId = typeof body?.grantId === "string" ? body.grantId : "";
    const revoked = await revokeGrantForUid(guard.identity.uid, grantId);
    return revoked ? json({ ok: true }) : errorResponse(404, "not_found", "No such connection.");
  });
}
