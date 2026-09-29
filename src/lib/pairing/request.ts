// FILE: src/lib/pairing/request.ts
//
// Turning an incoming request into "this is a paired phone" (or not). Kept
// separate from service.ts so that app-session.ts and local-learn.ts can both
// ask the question without importing the whole pairing surface.
import "server-only";

import { headers } from "next/headers";

import { authenticateToken, looksLikeDeviceToken } from "./service";
import type { Outcome } from "./service-logic";
import type { PairedDeviceRecord } from "./store";

export const PAIRING_ADMIN_COOKIE = "cadence_pair_admin";
export const PAIRING_ADMIN_HEADER = "x-cadence-admin-token";

export function readBearerToken(headerValue: string | null | undefined): string | null {
  if (typeof headerValue !== "string" || !headerValue.startsWith("Bearer ")) {
    return null;
  }
  const token = headerValue.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve the paired device behind the current request, if any.
 *
 * Returns `null` when the request carries no Cadence device token at all — the
 * caller should then fall through to its normal auth (Supabase bearer, or
 * cookies). Returns a failed outcome when a device token was presented but is
 * revoked or expired, so the caller can answer 401 with a code the phone knows
 * how to act on instead of a generic "unauthorized".
 */
export async function resolveDeviceFromRequest(): Promise<Outcome<PairedDeviceRecord> | null> {
  const headerStore = await headers();
  const token = readBearerToken(headerStore.get("authorization"));

  if (!token || !looksLikeDeviceToken(token)) {
    return null;
  }

  return authenticateToken(token);
}

/** Same question, for a `Request` the handler already holds. */
export async function resolveDeviceFromHeaders(
  request: Request,
): Promise<Outcome<PairedDeviceRecord> | null> {
  const token = readBearerToken(request.headers.get("authorization"));

  if (!token || !looksLikeDeviceToken(token)) {
    return null;
  }

  return authenticateToken(token);
}
