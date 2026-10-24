// FILE: src/lib/oauth/config.ts
//
// OAuth 2.1 for Cadence's MCP connector. Cadence is its own authorization
// server for exactly one protected resource, https://cadence.pstepanov.dev/api/mcp.
// Tokens are audience-bound to that URL, so a token minted here can never be
// replayed against another server and one minted elsewhere is refused here.
//
// Scopes: cadence:read (always granted), cadence:write (adding flashcards and
// logging practice). Plus is checked per call from users/{uid}.plus, never
// from a scope.
import { CANONICAL_ORIGIN } from "../server/env";

export const SCOPE_READ = "cadence:read";
export const SCOPE_WRITE = "cadence:write";

export const MCP_RESOURCE_PATH = "/api/mcp";
export const MCP_RESOURCE_NAME = "Cadence";

export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;
export const DEFAULT_SCOPES = [SCOPE_READ];

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  [SCOPE_READ]: "See your streak, practice totals, recent results and level, look up grammar, and take quizzes. With Cadence Plus: your weak sounds and grammar, due flashcards and full practice history.",
  [SCOPE_WRITE]: "Add flashcards to your review queue and log practice you did.",
};

/** The consent page (built by the web app) and the sign-in page it sends people to. */
export const AUTHORIZATION_PAGE_PATH = "/oauth/authorize";
export const SIGN_IN_PATH = "/login";

export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A grant ends after 180 days however often it is refreshed. */
export const MAX_GRANT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

/** A rotated refresh token presented again inside this window is a client retry, not theft. */
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;

export { CANONICAL_ORIGIN };

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHostname(hostname: string) {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

/** OAUTH_ISSUER, when it is a bare https origin (or http on loopback). Anything else is ignored. */
function configuredIssuer() {
  const raw = process.env.OAUTH_ISSUER?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const secure = url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname));
    if (secure && (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash) return url.origin;
  } catch {
    // Fall through.
  }
  console.error("OAUTH_ISSUER is not a valid https origin; using the canonical origin instead.");
  return null;
}

type HeaderSource = { headers: Pick<Headers, "get"> };

/**
 * The origin for the issuer, every endpoint URL and the token audience. The
 * Host header is never trusted in production: a spoofed host would let an
 * attacker mint metadata pointing at their own server. Outside production a
 * loopback Host is honoured so the server runs locally.
 */
export function getBaseUrl(request: HeaderSource) {
  const issuer = configuredIssuer();
  if (issuer) return issuer;
  if (process.env.NODE_ENV === "production") return CANONICAL_ORIGIN;
  const host = request.headers.get("host");
  if (!host) return CANONICAL_ORIGIN;
  try {
    const url = new URL(`http://${host}`);
    if (isLoopbackHostname(url.hostname) && url.host === host.toLowerCase()) return url.origin;
  } catch {
    // A malformed Host gets the canonical origin.
  }
  return CANONICAL_ORIGIN;
}

export function getMcpResourceUrl(request: HeaderSource) {
  return `${getBaseUrl(request)}${MCP_RESOURCE_PATH}`;
}

export function getResourceMetadataUrl(request: HeaderSource) {
  return `${getBaseUrl(request)}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
}

export function isOwnResource(request: HeaderSource, resource: string) {
  return resource.replace(/\/+$/, "") === getMcpResourceUrl(request);
}

export function parseScopeString(raw?: string | null) {
  if (!raw) return [] as string[];
  return Array.from(new Set(raw.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)));
}

function isSupportedScope(scope: string) {
  return (SUPPORTED_SCOPES as readonly string[]).includes(scope);
}

/** Requested scopes narrowed to what this server grants, always including read. */
export function normalizeScopes(raw: string | null | undefined) {
  const granted = parseScopeString(raw).filter(isSupportedScope);
  return Array.from(new Set([SCOPE_READ, ...granted]));
}

/** Scopes as approved on the consent page: narrowed, read always included. */
export function filterSupportedScopes(raw: string | null | undefined) {
  return normalizeScopes(raw);
}

export function hasScope(scopes: readonly string[], scope: string) {
  return scopes.includes(scope);
}
