// FILE: src/lib/oauth/redirect-uri.ts

import { isLoopbackHostname } from "./config";

export const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2000;

/**
 * Schemes that must never receive a code. The consent page navigates to the
 * redirect URI from script, so a `javascript:` or `data:` URI would run on
 * Cadence's own origin; the others open local files or reach nothing a client
 * could listen on.
 */
const FORBIDDEN_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "about:",
  "filesystem:",
  "ws:",
  "wss:",
  "ftp:",
  "mailto:",
  "tel:",
  "sms:",
]);

/**
 * Redirect URI rules for registration (RFC 7591, RFC 8252, OAuth 2.1):
 *
 * - https on any host. There is deliberately no host allowlist: the owner's
 *   own MCP bundle at pstepanov.dev registers like any other client, and an
 *   allowlist on a different product refused it and broke that integration.
 *   What stops a hostile https client is the consent screen, which leads with
 *   the destination host, and the impersonation check.
 * - http only on loopback, for native clients listening locally.
 * - private-use schemes such as cursor: or vscode:, minus the dangerous ones.
 * - never a fragment, never credentials in the URL.
 */
export function isAllowedRedirectUri(value: string) {
  if (value.length > MAX_REDIRECT_URI_LENGTH || value !== value.trim()) {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.hash || value.includes("#") || parsed.username || parsed.password) {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();

  if (protocol === "https:") {
    return parsed.hostname.length > 0;
  }

  if (protocol === "http:") {
    return isLoopbackHostname(parsed.hostname);
  }

  // A private-use scheme: letters, digits, "+", "-", "." per RFC 3986.
  return /^[a-z][a-z0-9+.-]*:$/.test(protocol) && !FORBIDDEN_SCHEMES.has(protocol);
}
