// FILE: mobile/src/pairing/protocol.ts
//
// The wire contract between a Cadence server (desktop app or docker-compose)
// and a phone on the same Wi-Fi. This module is deliberately free of Node and
// React Native APIs so both sides can hold an identical copy and so the parsing
// and expiry rules can be unit tested on their own.
//
// This is the phone's copy. The server's is src/lib/pairing/protocol.ts and the
// two must stay byte-identical below the header; tests/pairing/protocol.test.ts
// asserts that. docs/PAIRING_PROTOCOL.md is the written spec.

/**
 * Bumped whenever the payload shape or the claim exchange changes in a way an
 * older peer cannot understand. Both sides refuse a mismatch loudly rather than
 * guessing, so a stale app never half-works against a newer server.
 */
export const PAIRING_PROTOCOL_VERSION = 1;

/** Deep link scheme already registered by the Expo app (`"scheme": "cadence"`). */
export const PAIRING_URI_SCHEME = "cadence";
export const PAIRING_URI_HOST = "pair";

/** A pairing code is only good for two minutes. */
export const PAIRING_CODE_TTL_MS = 2 * 60 * 1000;

/** Device tokens are long-lived but not eternal: one year, then re-pair. */
export const DEVICE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** Prefix that lets the server tell a device token from a Supabase JWT at a glance. */
export const DEVICE_TOKEN_PREFIX = "cdnc_dev_";

/**
 * Crockford-style alphabet with the characters people mistype removed:
 * no I, L, O, U, 0 or 1. 32 symbols x 12 characters = 60 bits of entropy,
 * which is far more than a two-minute one-shot window needs and still short
 * enough to read off a screen and type into a phone.
 */
export const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 12;
export const PAIRING_CODE_GROUP = 4;

/** What the QR encodes, and what a scanner hands back after parsing. */
export interface PairingPayload {
  /** Protocol version the server speaks. */
  version: number;
  /** Stable random id for this Cadence install. Identity continuity, not a secret. */
  serverId: string;
  /** Human label for the computer, e.g. "Pavel's MacBook Pro". */
  serverName: string;
  /** LAN IPv4 literal, e.g. "192.168.1.42". Most reliable for the first connect. */
  host: string;
  /** Port the Next.js server listens on. */
  port: number;
  /** Bonjour hostname, e.g. "pavels-macbook-pro.local". Survives a DHCP reshuffle. */
  mdnsHost: string | null;
  /** "http" today. Reserved so a future TLS build can flip it without a new version. */
  scheme: "http" | "https";
  /** The one-time code, normalized (no dashes). */
  code: string;
  /** Absolute expiry, epoch milliseconds. */
  expiresAt: number;
}

export interface PairedDeviceSummary {
  deviceId: string;
  name: string;
  platform: string;
  model: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
}

export interface ServerInfo {
  protocolVersion: number;
  serverId: string;
  serverName: string;
  appVersion: string;
  /** Whether the pronunciation engines are actually answering right now. */
  enginesReady: boolean;
}

export interface ClaimRequest {
  protocolVersion: number;
  code: string;
  device: {
    name: string;
    platform: string;
    model?: string | null;
  };
}

export interface ClaimResponse {
  deviceToken: string;
  deviceId: string;
  expiresAt: number;
  server: ServerInfo;
}

/**
 * Error codes both sides agree on. The phone maps these to sentences a person
 * can act on; see mobile/src/pairing/errors.ts.
 */
export const PAIRING_ERROR_CODES = [
  "invalid_request",
  "protocol_version_mismatch",
  "code_not_found",
  "code_expired",
  "code_already_used",
  "device_revoked",
  "token_expired",
  "unauthorized",
  "server_error",
] as const;

export type PairingErrorCode = (typeof PAIRING_ERROR_CODES)[number];

const PAIRING_ERROR_CODE_SET: ReadonlySet<string> = new Set(PAIRING_ERROR_CODES);

export function isPairingErrorCode(value: unknown): value is PairingErrorCode {
  return typeof value === "string" && PAIRING_ERROR_CODE_SET.has(value);
}

// --- Pairing codes -----------------------------------------------------------

/**
 * Accept what a person actually types: lower case, spaces, and missing or extra
 * dashes. The alphabet already excludes every lookalike pair (no 0/O, no 1/I/L,
 * no U), so there is nothing to disambiguate — anything outside it is a typo we
 * cannot repair, and we say so rather than guessing. Returns null when the
 * result is not a plausible code.
 */
export function normalizePairingCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");

  if (cleaned.length !== PAIRING_CODE_LENGTH) {
    return null;
  }

  for (const character of cleaned) {
    if (!PAIRING_CODE_ALPHABET.includes(character)) {
      return null;
    }
  }

  return cleaned;
}

/** Render a normalized code for display: XXXX-XXXX-XXXX. */
export function formatPairingCode(code: string): string {
  const groups: string[] = [];
  for (let index = 0; index < code.length; index += PAIRING_CODE_GROUP) {
    groups.push(code.slice(index, index + PAIRING_CODE_GROUP));
  }
  return groups.join("-");
}

// --- QR payload --------------------------------------------------------------

/**
 * Build the string the QR encodes. A `cadence://pair?...` URI rather than raw
 * JSON so that scanning it with the system camera deep-links straight into the
 * app, and so a person can paste it into the manual field if the camera is
 * refused.
 */
export function buildPairingUri(payload: PairingPayload): string {
  const params = new URLSearchParams();
  params.set("v", String(payload.version));
  params.set("id", payload.serverId);
  params.set("name", payload.serverName);
  params.set("host", payload.host);
  params.set("port", String(payload.port));
  params.set("scheme", payload.scheme);
  params.set("code", payload.code);
  params.set("exp", String(payload.expiresAt));
  if (payload.mdnsHost) {
    params.set("mdns", payload.mdnsHost);
  }

  return `${PAIRING_URI_SCHEME}://${PAIRING_URI_HOST}?${params.toString()}`;
}

export type ParseResult =
  | { ok: true; payload: PairingPayload }
  | { ok: false; reason: ParseFailure };

export type ParseFailure =
  | "not_a_pairing_uri"
  | "malformed"
  | "unsupported_version"
  | "server_too_new"
  | "server_too_old";

/**
 * Parse a scanned string. Never throws: a camera will happily hand us a Wi-Fi
 * QR, a URL or a shopping barcode, and the scanner screen needs a reason it can
 * show rather than a crash.
 */
export function parsePairingUri(
  raw: string,
  supportedVersion: number = PAIRING_PROTOCOL_VERSION,
): ParseResult {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (!trimmed.toLowerCase().startsWith(`${PAIRING_URI_SCHEME}://${PAIRING_URI_HOST}`)) {
    return { ok: false, reason: "not_a_pairing_uri" };
  }

  let params: URLSearchParams;
  try {
    const queryIndex = trimmed.indexOf("?");
    params = new URLSearchParams(queryIndex >= 0 ? trimmed.slice(queryIndex + 1) : "");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const version = toInteger(params.get("v"));
  if (version === null) {
    return { ok: false, reason: "malformed" };
  }

  if (version !== supportedVersion) {
    return {
      ok: false,
      reason: version > supportedVersion ? "server_too_new" : "server_too_old",
    };
  }

  const serverId = params.get("id");
  const host = params.get("host");
  const port = toInteger(params.get("port"));
  const code = normalizePairingCode(params.get("code"));
  const expiresAt = toInteger(params.get("exp"));
  const schemeValue = params.get("scheme") ?? "http";

  if (
    !serverId ||
    !host ||
    port === null ||
    port <= 0 ||
    port > 65535 ||
    !code ||
    expiresAt === null ||
    (schemeValue !== "http" && schemeValue !== "https")
  ) {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    payload: {
      version,
      serverId,
      serverName: params.get("name") || "Cadence",
      host,
      port,
      mdnsHost: params.get("mdns") || null,
      scheme: schemeValue,
      code,
      expiresAt,
    },
  };
}

export function isPayloadExpired(payload: PairingPayload, now: number = Date.now()): boolean {
  return payload.expiresAt <= now;
}

/** Milliseconds left on a QR, floored at zero so a countdown never goes negative. */
export function millisecondsUntilExpiry(
  payload: Pick<PairingPayload, "expiresAt">,
  now: number = Date.now(),
): number {
  return Math.max(0, payload.expiresAt - now);
}

// --- Addresses ---------------------------------------------------------------

/**
 * Build the base URL for a candidate host. Kept here so the server, the docs
 * and the phone all agree on exactly how an address becomes a URL.
 */
export function buildBaseUrl(options: {
  scheme: "http" | "https";
  host: string;
  port: number;
}): string {
  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  return `${options.scheme}://${host}:${options.port}`;
}

function toInteger(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
