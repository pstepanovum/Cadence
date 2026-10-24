// FILE: src/app/api/devices/route.ts
//
// PUT {installId, expoPushToken, platform, timeZone}: remembers this phone's
// Expo push token on the signed-in account (free or Plus).
// DELETE ?installId=: forgets it, before the phone signs out.
// App Check and the Firebase ID token, like the other app routes.
import { errorResponse, json, readJsonObject } from "@/lib/server/http";
import { removePushDevice, savePushDevice } from "@/lib/server/push";
import { isInstallId, parsePushDevice } from "@/lib/server/push-messages";
import { handled, requireCloudUser } from "@/lib/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(request: Request) {
  return handled("Push device", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const parsed = parsePushDevice(await readJsonObject(request, 2048).catch(() => null));
    if (!parsed.ok) return errorResponse(400, "bad_request", parsed.message);
    await savePushDevice(guard.identity.uid, parsed.device);
    return json({ ok: true });
  });
}

export function DELETE(request: Request) {
  return handled("Push device", async () => {
    const guard = await requireCloudUser(request, { appCheck: true });
    if (!guard.ok) return guard.response;
    const installId = new URL(request.url).searchParams.get("installId");
    if (!isInstallId(installId)) return errorResponse(400, "bad_request", "installId is missing or malformed.");
    await removePushDevice(guard.identity.uid, installId);
    return json({ ok: true });
  });
}
