// FILE: src/lib/pairing/service.ts
//
// The filesystem-bound shell around service-logic.ts. Everything here is a thin
// wrapper: no decisions live in this file.
import "server-only";

import {
  getAppVersion,
  getLanAddresses,
  getMdnsHostname,
  getPrimaryLanAddress,
  getServerDisplayName,
  getServerPort,
} from "./identity";
import {
  PAIRING_CODE_TTL_MS,
  PAIRING_PROTOCOL_VERSION,
  buildPairingUri,
  type PairedDeviceSummary,
  type PairingPayload,
  type ServerInfo,
} from "./protocol";
import {
  adminTokenMatches,
  authenticateDeviceToken,
  claimPairingCode,
  issuePairingCode,
  listDevices,
  looksLikeDeviceToken,
  revokeDevice,
  type ClaimInput,
  type ClaimOutput,
  type Outcome,
} from "./service-logic";
import { readPairingState, withPairingState, type PairedDeviceRecord } from "./store";

export { looksLikeDeviceToken };

export interface IssuedPairingCode {
  payload: PairingPayload;
  uri: string;
  /** Every address the phone could use, so the screen can show alternatives. */
  addresses: string[];
}

export async function getServerInfo(enginesReady: boolean): Promise<ServerInfo> {
  const state = await readPairingState();

  return {
    protocolVersion: PAIRING_PROTOCOL_VERSION,
    serverId: state.serverId,
    serverName: getServerDisplayName(),
    appVersion: getAppVersion(),
    enginesReady,
  };
}

export async function getAdminToken(): Promise<string> {
  const state = await readPairingState();
  return state.adminToken;
}

export async function getSharedProfile() {
  const state = await readPairingState();
  return state.profile;
}

/** Mint a fresh QR. Replaces any code already on screen. */
export async function createPairingCode(
  now: number = Date.now(),
): Promise<IssuedPairingCode> {
  const { record, serverId } = await withPairingState((state) => {
    const mutation = issuePairingCode(state, now, PAIRING_CODE_TTL_MS);
    return {
      changed: mutation.changed,
      result: { record: mutation.result, serverId: state.serverId },
    };
  });

  const host = getPrimaryLanAddress();
  const payload: PairingPayload = {
    version: PAIRING_PROTOCOL_VERSION,
    serverId,
    serverName: getServerDisplayName(),
    // With no LAN address at all the QR is useless, but the manual code still
    // works if the person knows the address, so we emit a placeholder rather
    // than failing the whole screen.
    host: host ?? "0.0.0.0",
    port: getServerPort(),
    mdnsHost: getMdnsHostname(),
    scheme: "http",
    code: record.code,
    expiresAt: record.expiresAt,
  };

  return {
    payload,
    uri: buildPairingUri(payload),
    addresses: getLanAddresses().map((entry) => entry.address),
  };
}

export function claimCode(input: ClaimInput, now: number = Date.now()): Promise<Outcome<ClaimOutput>> {
  return withPairingState((state) => claimPairingCode(state, input, now));
}

export function authenticateToken(
  token: string,
  now: number = Date.now(),
): Promise<Outcome<PairedDeviceRecord>> {
  return withPairingState((state) => authenticateDeviceToken(state, token, now));
}

export function getPairedDevices(): Promise<PairedDeviceSummary[]> {
  return withPairingState((state) => ({ result: listDevices(state), changed: false }));
}

export function unpairDevice(
  deviceId: string,
  now: number = Date.now(),
): Promise<Outcome<PairedDeviceSummary>> {
  return withPairingState((state) => revokeDevice(state, deviceId, now));
}

/**
 * Authorizes the "show me a pairing code" surface. Anyone who can reach this
 * server over the LAN can load its pages, so the pairing screen itself has to
 * be gated on something only a person at the computer has: the admin token
 * written into the server's data directory.
 */
export async function isPairingAdmin(provided: string | null | undefined): Promise<boolean> {
  const configured = process.env.CADENCE_PAIRING_ADMIN_TOKEN?.trim();
  if (configured && adminTokenMatches(configured, provided)) {
    return true;
  }

  const state = await readPairingState();
  return adminTokenMatches(state.adminToken, provided);
}
