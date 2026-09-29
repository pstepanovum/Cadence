// FILE: src/app/api/pair/code/route.ts
//
// Mint the QR. Owner-only: a code is a credential, and issuing one to anyone
// who can reach the server over Wi-Fi would defeat the whole exchange.
import { NextResponse } from "next/server";

import { requirePairingAdmin, unauthorizedResponse } from "@/lib/pairing/admin";
import { createPairingCode } from "@/lib/pairing/service";
import { formatPairingCode } from "@/lib/pairing/protocol";
import { renderQrSvg } from "@/lib/pairing/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await requirePairingAdmin(request))) {
    return unauthorizedResponse();
  }

  const issued = await createPairingCode();

  return NextResponse.json(
    {
      uri: issued.uri,
      qrSvg: await renderQrSvg(issued.uri),
      displayCode: formatPairingCode(issued.payload.code),
      expiresAt: issued.payload.expiresAt,
      server: {
        serverId: issued.payload.serverId,
        serverName: issued.payload.serverName,
        host: issued.payload.host,
        port: issued.payload.port,
        mdnsHost: issued.payload.mdnsHost,
      },
      addresses: issued.addresses,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
