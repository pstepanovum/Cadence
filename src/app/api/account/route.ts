// FILE: src/app/api/account/route.ts
//
// DELETE: deletes the signed-in account (docs/PLATFORM.md section 11). Needs a
// sign-in within the last five minutes, so a stolen long-lived session cannot
// do it. The page offers GET /api/account/export first.
import { after } from "next/server";

import { requestDeletion } from "@/lib/server/account";
import { deliverSoon } from "@/lib/server/email/queue";
import { errorResponse, isSameOrigin, json } from "@/lib/server/http";
import { isRecentAuth } from "@/lib/server/identity";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function DELETE(request: Request) {
  return handled("Account deletion", async () => {
    if (!isSameOrigin(request)) return errorResponse(403, "forbidden", "Cross-site request refused.");
    const guard = await requireCloudUser(request);
    if (!guard.ok) return guard.response;
    if (!isRecentAuth(guard.identity)) return errorResponse(401, "reauth_required", "Sign in again to delete your account.");
    const result = await requestDeletion(guard.identity.uid, guard.identity.email);
    after(() => deliverSoon(result.mailKeys));
    const response = json({ status: result.status }, result.status === "completed" ? 200 : 202);
    response.headers.append("Set-Cookie", "__session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return response;
  });
}
