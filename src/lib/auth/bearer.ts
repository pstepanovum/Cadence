// FILE: src/lib/auth/bearer.ts
//
// Which identity an incoming request claims, decided from its headers and the
// mode cookie alone. Pure on purpose: getAppSession() does the verifying, this
// only says what to verify, so the order can be tested without a server.
import { DEVICE_TOKEN_PREFIX } from "../pairing/protocol";

export function readBearerToken(headerValue: string | null | undefined): string | null {
  if (typeof headerValue !== "string" || !headerValue.startsWith("Bearer ")) {
    return null;
  }
  const token = headerValue.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export type SessionSource =
  /** A phone paired to this server over the LAN. */
  | { kind: "device"; token: string }
  /** A cloud client (the mobile app, the desktop billing proxy) with a Firebase ID token. */
  | { kind: "id-token"; token: string }
  /** The browser's local profile cookie. */
  | { kind: "local-cookie" }
  /** The browser's Firebase session cookie. */
  | { kind: "session-cookie" }
  | { kind: "none" };

/**
 * The order is the security property: a bearer token always wins over cookies,
 * so stray cookies in a phone's cookie jar can never override the identity the
 * token names. A device token is told apart from an ID token by its prefix.
 */
export function chooseSessionSource(input: {
  authorization: string | null | undefined;
  modeCookie: "local" | "cloud" | null;
}): SessionSource {
  const token = readBearerToken(input.authorization);

  if (token) {
    return token.startsWith(DEVICE_TOKEN_PREFIX)
      ? { kind: "device", token }
      : { kind: "id-token", token };
  }

  if (input.modeCookie === "local") {
    return { kind: "local-cookie" };
  }

  if (input.modeCookie === "cloud") {
    return { kind: "session-cookie" };
  }

  return { kind: "none" };
}
