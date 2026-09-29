// FILE: mobile/src/pairing/client.ts
//
// The two network calls pairing needs: probe an address, and redeem a code.
// Both are deliberately short-timeout: a phone sweeping three candidate
// addresses must not sit on a dead one for thirty seconds.
import * as Device from "expo-device";
import { Platform } from "react-native";

import {
  PAIRING_PROTOCOL_VERSION,
  buildBaseUrl,
  type ClaimResponse,
  type PairingPayload,
  type ServerInfo,
} from "@/pairing/protocol";
import type { StoredConnection } from "@/pairing/discovery";
import { failureFromServerCode, type ConnectionFailure } from "@/pairing/errors";

/**
 * Long enough for a laptop that just woke up, short enough that sweeping three
 * addresses still feels instant when the first one is simply wrong.
 */
const PROBE_TIMEOUT_MS = 2_500;
const CLAIM_TIMEOUT_MS = 8_000;

export type ProbeResult =
  | { ok: true; info: ServerInfo }
  | { ok: false; failure: ConnectionFailure };

/**
 * Ask an address who it is. Unauthenticated: the phone must not send its device
 * token until it has confirmed the server id matches the one it paired with.
 */
export async function probeServer(baseUrl: string): Promise<ProbeResult> {
  try {
    const response = await fetch(`${baseUrl}/api/pair/info`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, failure: "server_unreachable" };
    }

    const info = (await response.json()) as ServerInfo;

    if (typeof info?.serverId !== "string" || typeof info?.protocolVersion !== "number") {
      // Something answered on this port, but it is not Cadence.
      return { ok: false, failure: "server_unreachable" };
    }

    if (info.protocolVersion > PAIRING_PROTOCOL_VERSION) {
      return { ok: false, failure: "server_too_new" };
    }

    if (info.protocolVersion < PAIRING_PROTOCOL_VERSION) {
      return { ok: false, failure: "server_too_old" };
    }

    return { ok: true, info };
  } catch {
    return { ok: false, failure: "server_unreachable" };
  }
}

export type ClaimResult =
  | { ok: true; deviceToken: string; connection: StoredConnection }
  | { ok: false; failure: ConnectionFailure };

/** How the computer's pairing screen will label this phone. */
export function describeThisDevice(): { name: string; platform: string; model: string | null } {
  const name = Device.deviceName?.trim();
  const model = Device.modelName ?? null;

  return {
    name: name && name.length > 0 ? name : (model ?? "Phone"),
    platform: Platform.OS,
    model,
  };
}

/**
 * Redeem the one-time code from the QR for a long-lived device token.
 *
 * The address comes from the payload rather than from discovery: at this point
 * the phone has never spoken to this computer, so the QR is the only thing that
 * knows where it is.
 */
export async function claimPairing(payload: PairingPayload): Promise<ClaimResult> {
  const baseUrl = buildBaseUrl({
    scheme: payload.scheme,
    host: payload.host,
    port: payload.port,
  });

  try {
    const response = await fetch(`${baseUrl}/api/pair/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        protocolVersion: PAIRING_PROTOCOL_VERSION,
        code: payload.code,
        device: describeThisDevice(),
      }),
      signal: AbortSignal.timeout(CLAIM_TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as
      | (ClaimResponse & { code?: string })
      | null;

    if (!response.ok || !body?.deviceToken) {
      return { ok: false, failure: failureFromServerCode(body?.code ?? null) };
    }

    // The server id in the response is what every later reconnect is checked
    // against. Taking it from the response rather than the QR means a QR that
    // was tampered with cannot bind the phone to a server it never reached.
    return {
      ok: true,
      deviceToken: body.deviceToken,
      connection: {
        serverId: body.server.serverId,
        serverName: body.server.serverName,
        host: payload.host,
        port: payload.port,
        mdnsHost: payload.mdnsHost,
        scheme: payload.scheme,
        lastGoodBaseUrl: baseUrl,
      },
    };
  } catch {
    return { ok: false, failure: "server_unreachable" };
  }
}

/**
 * Check a stored token is still good. Called on launch and after a network
 * change, so a phone that was unpaired finds out promptly instead of failing
 * mid-practice.
 */
export async function verifySession(
  baseUrl: string,
  deviceToken: string,
): Promise<{ ok: true } | { ok: false; failure: ConnectionFailure }> {
  try {
    const response = await fetch(`${baseUrl}/api/pair/session`, {
      headers: { Authorization: `Bearer ${deviceToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (response.ok) {
      return { ok: true };
    }

    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    return { ok: false, failure: failureFromServerCode(body?.code ?? null) };
  } catch {
    return { ok: false, failure: "server_unreachable" };
  }
}
