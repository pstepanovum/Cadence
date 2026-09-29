// FILE: src/lib/pairing/store.ts
//
// Pairing state has to outlive a request, a browser cookie jar and a container
// restart, and local mode has no database. So it lives in one JSON file in the
// server's data directory, written atomically and serialized through a promise
// chain so two concurrent claims can never interleave a read-modify-write.
//
// Where the file lives:
//   CADENCE_DATA_DIR        explicit, used by docker-compose and the desktop app
//   ~/.cadence              otherwise
import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface PairingCodeRecord {
  /** Normalized code, uppercase, no dashes. Short-lived and single use. */
  code: string;
  createdAt: number;
  expiresAt: number;
  /** Set the moment it is redeemed, so a replay is refused rather than re-honored. */
  usedAt: number | null;
  usedByDeviceId: string | null;
}

export interface PairedDeviceRecord {
  deviceId: string;
  name: string;
  platform: string;
  model: string | null;
  /**
   * SHA-256 of the device token, hex. The token itself is never written to
   * disk: if this file leaks it hands over no usable credential, and revocation
   * is immediate because the digest is the lookup key.
   */
  tokenDigest: string;
  pairedAt: number;
  expiresAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

export interface PairingState {
  version: 1;
  /** Stable identity for this install. Not a secret; it is printed in the QR. */
  serverId: string;
  /** Authorizes the "show me a pairing code" screen. Treated as a secret. */
  adminToken: string;
  codes: PairingCodeRecord[];
  devices: PairedDeviceRecord[];
  /**
   * The single local profile every paired device shares. Phones and tablets
   * paired to the same computer practice against the same progress.
   */
  profile: {
    id: string;
    displayName: string;
    createdAt: string;
  };
}

export function resolveDataDir(): string {
  const configured = process.env.CADENCE_DATA_DIR?.trim();
  if (configured) {
    return configured;
  }
  return join(homedir(), ".cadence");
}

export function resolvePairingFile(): string {
  return join(resolveDataDir(), "pairing.json");
}

function createInitialState(): PairingState {
  return {
    version: 1,
    serverId: randomBytes(16).toString("hex"),
    adminToken: randomBytes(24).toString("base64url"),
    codes: [],
    devices: [],
    profile: {
      id: `local-paired-${randomBytes(8).toString("hex")}`,
      displayName: "Local learner",
      createdAt: new Date().toISOString(),
    },
  };
}

function reviveState(raw: unknown): PairingState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<PairingState>;

  if (
    candidate.version !== 1 ||
    typeof candidate.serverId !== "string" ||
    typeof candidate.adminToken !== "string" ||
    !Array.isArray(candidate.codes) ||
    !Array.isArray(candidate.devices) ||
    !candidate.profile ||
    typeof candidate.profile.id !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    serverId: candidate.serverId,
    adminToken: candidate.adminToken,
    codes: candidate.codes,
    devices: candidate.devices,
    profile: {
      id: candidate.profile.id,
      displayName: candidate.profile.displayName ?? "Local learner",
      createdAt: candidate.profile.createdAt ?? new Date().toISOString(),
    },
  };
}

// Reads are cached for the life of the process; writes go through `queue` so a
// burst of concurrent claims is applied one at a time.
let cached: PairingState | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function loadState(): Promise<PairingState> {
  if (cached) {
    return cached;
  }

  const file = resolvePairingFile();

  try {
    const contents = await readFile(file, "utf8");
    const revived = reviveState(JSON.parse(contents));
    if (revived) {
      cached = revived;
      return revived;
    }
  } catch {
    // Missing or unreadable: fall through and start fresh.
  }

  const fresh = createInitialState();
  await persist(fresh);
  cached = fresh;
  return fresh;
}

async function persist(state: PairingState): Promise<void> {
  const file = resolvePairingFile();
  await mkdir(dirname(file), { recursive: true });

  // Write-then-rename so a crash mid-write cannot leave a half-written file
  // that would lose every paired device.
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, file);
}

/**
 * Run `mutate` against the current state with no other mutation interleaved.
 * Whatever it returns is handed back to the caller; the state is persisted only
 * when `mutate` reports a change.
 */
export function withPairingState<T>(
  mutate: (state: PairingState) => { result: T; changed: boolean } | Promise<{ result: T; changed: boolean }>,
): Promise<T> {
  const run = queue.then(async () => {
    const state = await loadState();
    const { result, changed } = await mutate(state);
    if (changed) {
      await persist(state);
      cached = state;
    }
    return result;
  });

  // Keep the chain alive even when one mutation rejects.
  queue = run.catch(() => undefined);

  return run;
}

/** Read-only access, still serialized behind any in-flight write. */
export function readPairingState(): Promise<PairingState> {
  return withPairingState((state) => ({ result: state, changed: false }));
}

/** Test seam: drop the process cache so a test can point at a fresh directory. */
export function resetPairingStateCache(): void {
  cached = null;
  queue = Promise.resolve();
}
