// FILE: src/app/api/sync/inbox/route.ts
//
// Flashcards added through the MCP connector, waiting for a device.
// GET lists them; DELETE {ids?: string[]} acknowledges the ones the device
// took (all of them without ids), and the document goes once it is empty.
import { acknowledgeInbox, readInbox } from "@/lib/server/sync";
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Inbox read", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    return json({ cards: await readInbox(guard.identity.uid) });
  });
}

export function DELETE(request: Request) {
  return handled("Inbox acknowledge", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const body = await readJsonObject(request, 16 * 1024).catch(() => null);
    const ids = body?.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 200 || !ids.every((id) => typeof id === "string"))) {
      return errorResponse(400, "bad_request", "ids must be a list of card ids.");
    }
    return json({ removed: await acknowledgeInbox(guard.identity.uid, (ids as string[] | undefined) ?? "all") });
  });
}
