// FILE: src/app/api/pair/info/route.ts
//
// The probe. Unauthenticated on purpose: the phone calls it against every
// candidate address it knows to work out which one is live and whether the
// thing answering is the same computer it paired with. It reveals nothing a
// device on the LAN could not already learn by connecting.
import { NextResponse } from "next/server";

import { getAiEngineUrlForRequest } from "@/lib/runtime/request-runtime";
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

async function areEnginesReady(request: Request): Promise<boolean> {
  try {
    const response = await fetch(`${getAiEngineUrlForRequest(request)}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string; modelReady?: boolean };
    return payload.status === "ok" && payload.modelReady === true;
  } catch {
    return false;
  }
}
