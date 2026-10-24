// FILE: src/lib/server/identity.ts
//
// Who a request is from, for the cloud routes (sync, billing, account, AI
// gating). The same order as getAppSession(): a bearer token always wins over
// cookies, a paired-device token is never a cloud identity, and an invalid or
// revoked token is "nobody", never a fall-through to the cookie.
import { auth } from "./firebase";
import { firebaseProjectId } from "./env";
import { bearerToken, readCookie } from "./http";

export const DEVICE_TOKEN_PREFIX = "cdnc_dev_";
export const SESSION_COOKIE = "__session";

export interface CloudIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** Seconds since the epoch of the last real sign-in. */
  authTime: number;
  via: "id-token" | "session-cookie";
}

export type RequestIdentity =
  | { kind: "cloud"; identity: CloudIdentity }
  /** A phone paired to this server, or a browser in local mode. */
  | { kind: "local" }
  | { kind: "none" };

export async function identify(request: Request): Promise<RequestIdentity> {
  const token = bearerToken(request);
  if (token) {
    if (token.startsWith(DEVICE_TOKEN_PREFIX)) return { kind: "local" };
    const identity = await verify(() => auth().verifyIdToken(token, true), "id-token");
    return identity ? { kind: "cloud", identity } : { kind: "none" };
  }

  const cookie = readCookie(request, SESSION_COOKIE);
  if (cookie) {
    const identity = await verify(() => auth().verifySessionCookie(cookie, true), "session-cookie");
    if (identity) return { kind: "cloud", identity };
  }

  return readCookie(request, "cadence_app_mode") === "local" ? { kind: "local" } : { kind: "none" };
}

/** The cloud identity, or null for anyone else. */
export async function cloudIdentity(request: Request): Promise<CloudIdentity | null> {
  const result = await identify(request);
  return result.kind === "cloud" ? result.identity : null;
}

async function verify(
  run: () => Promise<{ uid: string; email?: string; email_verified?: boolean; auth_time: number }>,
  via: CloudIdentity["via"],
): Promise<CloudIdentity | null> {
  if (!firebaseProjectId()) return null;
  try {
    const decoded = await run();
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      authTime: decoded.auth_time,
      via,
    };
  } catch {
    return null;
  }
}

/** Account deletion and email changes need a sign-in within this many seconds. */
export const RECENT_AUTH_SECONDS = 5 * 60;

export function isRecentAuth(identity: CloudIdentity, nowMs = Date.now()): boolean {
  return nowMs / 1000 - identity.authTime <= RECENT_AUTH_SECONDS;
}
