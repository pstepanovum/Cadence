// FILE: src/lib/pairing/service-logic.ts
//
// Every decision the pairing service makes, as pure functions over a plain
// state object plus an explicit clock. The filesystem lives next door in
// store.ts and the HTTP shell in service.ts, so all of the rules that actually
// matter — single use, expiry, revocation — are unit testable without a server.
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PairedDeviceRecord, PairingCodeRecord, PairingState } from "./store";
import {
  DEVICE_TOKEN_PREFIX,
  DEVICE_TOKEN_TTL_MS,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_MS,
  PAIRING_PROTOCOL_VERSION,
  normalizePairingCode,
  type PairedDeviceSummary,
  type PairingErrorCode,
} from "./protocol";

export interface Mutation<T> {
  result: T;
  changed: boolean;
}

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; code: PairingErrorCode; message: string };

// --- Secrets -----------------------------------------------------------------

/**
 * Rejection-sampled so every symbol is equally likely. `randomBytes % 30` would
 * bias the first two characters of the alphabet, which is a small thing but a
 * free one to get right.
 */
export function generatePairingCode(): string {
  const alphabet = PAIRING_CODE_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  let code = "";

  while (code.length < PAIRING_CODE_LENGTH) {
    for (const byte of randomBytes(PAIRING_CODE_LENGTH)) {
      if (byte >= limit) {
        continue;
      }
      code += alphabet[byte % alphabet.length];
      if (code.length === PAIRING_CODE_LENGTH) {
        break;
      }
    }
  }

  return code;
}

export function generateDeviceToken(): string {
  return `${DEVICE_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeDeviceToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(DEVICE_TOKEN_PREFIX);
}

// --- Codes -------------------------------------------------------------------

/**
 * Drop codes that can never be redeemed again. Keeps the file from growing
 * without bound and, more importantly, means a redeemed code cannot linger in a
 * state where a bug could re-honor it.
 */
export function pruneCodes(state: PairingState, now: number): boolean {
  const before = state.codes.length;
  state.codes = state.codes.filter(
    (record) => record.usedAt === null && record.expiresAt > now,
  );
  return state.codes.length !== before;
}

export function issuePairingCode(
  state: PairingState,
  now: number,
  ttlMs: number = PAIRING_CODE_TTL_MS,
): Mutation<PairingCodeRecord> {
  pruneCodes(state, now);

  // Only one code is live at a time. Showing the pairing screen again replaces
  // the previous QR rather than leaving a second valid code floating around.
  state.codes = [];

  const record: PairingCodeRecord = {
    code: generatePairingCode(),
    createdAt: now,
    expiresAt: now + ttlMs,
    usedAt: null,
    usedByDeviceId: null,
  };

  state.codes.push(record);

  return { result: record, changed: true };
}

// --- Claim -------------------------------------------------------------------

export interface ClaimInput {
  protocolVersion: number;
  code: string;
  device: { name: string; platform: string; model?: string | null };
}

export interface ClaimOutput {
  deviceToken: string;
  device: PairedDeviceRecord;
}

/**
 * Exchange a one-time code for a long-lived device token. The order matters:
 * the code is marked used before the token is minted, so a second request that
 * arrives while the first is still in flight is refused rather than issuing a
 * second token. The store serializes callers, which is what makes that hold.
 */
export function claimPairingCode(
  state: PairingState,
  input: ClaimInput,
  now: number,
): Mutation<Outcome<ClaimOutput>> {
  if (input.protocolVersion !== PAIRING_PROTOCOL_VERSION) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "protocol_version_mismatch",
        message:
          input.protocolVersion > PAIRING_PROTOCOL_VERSION
            ? "This phone is newer than Cadence on your computer. Update Cadence on the computer."
            : "Cadence on your computer is newer than this app. Update the app.",
      },
    };
  }

  const normalized = normalizePairingCode(input.code);
  if (!normalized) {
    return {
      changed: false,
      result: { ok: false, code: "invalid_request", message: "That code is not a Cadence pairing code." },
    };
  }

  const name = typeof input.device?.name === "string" ? input.device.name.trim() : "";
  const platform = typeof input.device?.platform === "string" ? input.device.platform.trim() : "";

  if (!name || !platform) {
    return {
      changed: false,
      result: { ok: false, code: "invalid_request", message: "The device did not identify itself." },
    };
  }

  const record = state.codes.find((entry) => entry.code === normalized);

  if (!record) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "code_not_found",
        message: "That code does not match the one on your computer.",
      },
    };
  }

  if (record.usedAt !== null) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "code_already_used",
        message: "That code was already used. Show a new one on your computer.",
      },
    };
  }

  if (record.expiresAt <= now) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "code_expired",
        message: "That code has expired. Show a new one on your computer.",
      },
    };
  }

  const deviceId = randomUUID();
  const token = generateDeviceToken();

  record.usedAt = now;
  record.usedByDeviceId = deviceId;

  const device: PairedDeviceRecord = {
    deviceId,
    name: name.slice(0, 64),
    platform: platform.slice(0, 32),
    model: typeof input.device.model === "string" ? input.device.model.slice(0, 64) : null,
    tokenDigest: digestToken(token),
    pairedAt: now,
    expiresAt: now + DEVICE_TOKEN_TTL_MS,
    lastSeenAt: now,
    revokedAt: null,
  };

  state.devices.push(device);
  pruneCodes(state, now);

  return { changed: true, result: { ok: true, value: { deviceToken: token, device } } };
}

// --- Authentication ----------------------------------------------------------

/**
 * Look a token up by digest. The digest is the map key, so the stored secret is
 * never compared byte by byte and a wrong token simply misses.
 */
export function authenticateDeviceToken(
  state: PairingState,
  token: string,
  now: number,
): Mutation<Outcome<PairedDeviceRecord>> {
  const digest = digestToken(token);
  const device = state.devices.find((entry) => entry.tokenDigest === digest);

  if (!device) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "device_revoked",
        message: "This phone is no longer paired with your computer.",
      },
    };
  }

  if (device.revokedAt !== null) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "device_revoked",
        message: "This phone was unpaired from your computer.",
      },
    };
  }

  if (device.expiresAt <= now) {
    return {
      changed: false,
      result: {
        ok: false,
        code: "token_expired",
        message: "This pairing has expired. Pair with your computer again.",
      },
    };
  }

  // Cheap liveness for the device list, rounded to a minute so a burst of
  // requests does not rewrite the file on every call.
  const changed = device.lastSeenAt === null || now - device.lastSeenAt > 60_000;
  if (changed) {
    device.lastSeenAt = now;
  }

  return { changed, result: { ok: true, value: device } };
}

// --- Device management -------------------------------------------------------

export function listDevices(state: PairingState): PairedDeviceSummary[] {
  return state.devices
    .filter((device) => device.revokedAt === null)
    .sort((left, right) => right.pairedAt - left.pairedAt)
    .map((device) => ({
      deviceId: device.deviceId,
      name: device.name,
      platform: device.platform,
      model: device.model,
      pairedAt: new Date(device.pairedAt).toISOString(),
      lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
    }));
}

/**
 * Revocation drops the record outright rather than tombstoning it: the token
 * digest is the only thing that made it usable, and removing it means a later
 * bug cannot resurrect access.
 */
export function revokeDevice(
  state: PairingState,
  deviceId: string,
  now: number,
): Mutation<Outcome<PairedDeviceSummary>> {
  const index = state.devices.findIndex((device) => device.deviceId === deviceId);

  if (index === -1) {
    return {
      changed: false,
      result: { ok: false, code: "code_not_found", message: "That device is not paired." },
    };
  }

  const [removed] = state.devices.splice(index, 1);
  void now;

  return {
    changed: true,
    result: {
      ok: true,
      value: {
        deviceId: removed.deviceId,
        name: removed.name,
        platform: removed.platform,
        model: removed.model,
        pairedAt: new Date(removed.pairedAt).toISOString(),
        lastSeenAt: removed.lastSeenAt ? new Date(removed.lastSeenAt).toISOString() : null,
      },
    },
  };
}

/** Constant-time-ish comparison for the admin token guarding the pairing screen. */
export function adminTokenMatches(expected: string, provided: string | null | undefined): boolean {
  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }
  return digestToken(expected) === digestToken(provided);
}
