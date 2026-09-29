// FILE: src/app/api/pair/session/route.ts
//
// "Am I still paired?" The phone calls this on launch and after every network
// change so a revoked device finds out promptly and says so, instead of
// discovering it halfway through a practice session.
import { NextResponse } from "next/server";

import { resolveDeviceFromHeaders } from "@/lib/pairing/request";
import { getServerInfo } from "@/lib/pairing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const device = await resolveDeviceFromHeaders(request);

  if (!device) {
    return NextResponse.json(
      { error: "This request carried no Cadence device token.", code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!device.ok) {
    return NextResponse.json(
      { error: device.message, code: device.code },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      device: {
        deviceId: device.value.deviceId,
        name: device.value.name,
        pairedAt: new Date(device.value.pairedAt).toISOString(),
        expiresAt: device.value.expiresAt,
      },
      server: await getServerInfo(true),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
