// FILE: src/app/api/pair/info/route.ts
//
// The probe. Unauthenticated on purpose: the phone calls it against every
// candidate address it knows to work out which one is live and whether the
// thing answering is the same computer it paired with. It reveals nothing a
// device on the LAN could not already learn by connecting.
import { NextResponse } from "next/server";

import { areEnginesReady } from "@/lib/pairing/engines";
import { getServerInfo } from "@/lib/pairing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const info = await getServerInfo(await areEnginesReady(request));

  return NextResponse.json(info, {
    headers: {
      // Never let a phone act on a cached probe: the whole point is liveness.
      "Cache-Control": "no-store",
    },
  });
}
