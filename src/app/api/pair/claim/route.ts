// FILE: src/app/api/pair/claim/route.ts
//
// The one-time exchange: a pairing code in, a long-lived device token out.
// This is the only endpoint that mints a device token, and a code can pass
// through it exactly once.
import { NextResponse } from "next/server";

import { claimCode, getServerInfo } from "@/lib/pairing/service";
import { PAIRING_PROTOCOL_VERSION, type ClaimResponse } from "@/lib/pairing/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        protocolVersion?: unknown;
        code?: unknown;
        device?: { name?: unknown; platform?: unknown; model?: unknown };
      }
    | null;

  if (!body) {
    return errorResponse("invalid_request", "Cadence could not read that pairing request.", 400);
  }

  const outcome = await claimCode({
    protocolVersion:
      typeof body.protocolVersion === "number" ? body.protocolVersion : Number.NaN,
    code: typeof body.code === "string" ? body.code : "",
    device: {
      name: typeof body.device?.name === "string" ? body.device.name : "",
      platform: typeof body.device?.platform === "string" ? body.device.platform : "",
      model: typeof body.device?.model === "string" ? body.device.model : null,
    },
  });

  if (!outcome.ok) {
    return errorResponse(outcome.code, outcome.message, statusForCode(outcome.code));
  }

  const payload: ClaimResponse = {
    deviceToken: outcome.value.deviceToken,
    deviceId: outcome.value.device.deviceId,
    expiresAt: outcome.value.device.expiresAt,
    // The phone stores this and refuses to send its token to a server that
    // later reports a different serverId.
    server: await getServerInfo(true),
  };

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

function statusForCode(code: string): number {
  switch (code) {
    case "protocol_version_mismatch":
      return 409;
    case "code_not_found":
    case "code_expired":
    case "code_already_used":
      return 403;
    default:
      return 400;
  }
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: message, code, protocolVersion: PAIRING_PROTOCOL_VERSION },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
