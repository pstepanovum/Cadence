// FILE: src/app/api/pair/devices/[deviceId]/route.ts
//
// Revoking a device deletes its token digest, which is the only thing that made
// the token work. The next request from that phone gets a 401 with
// `device_revoked` and the app clears its keychain entry.
import { NextResponse } from "next/server";

import { requirePairingAdmin, unauthorizedResponse } from "@/lib/pairing/admin";
import { unpairDevice } from "@/lib/pairing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ deviceId: string }> },
) {
  if (!(await requirePairingAdmin(request))) {
    return unauthorizedResponse();
  }

  const { deviceId } = await context.params;
  const outcome = await unpairDevice(deviceId);

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.message, code: outcome.code },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { device: outcome.value },
    { headers: { "Cache-Control": "no-store" } },
  );
}
