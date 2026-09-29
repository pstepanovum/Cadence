// FILE: src/app/api/pair/devices/route.ts
import { NextResponse } from "next/server";

import { requirePairingAdmin, unauthorizedResponse } from "@/lib/pairing/admin";
import { getPairedDevices } from "@/lib/pairing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requirePairingAdmin(request))) {
    return unauthorizedResponse();
  }

  return NextResponse.json(
    { devices: await getPairedDevices() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
