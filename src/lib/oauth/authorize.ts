// FILE: src/lib/oauth/authorize.ts
//
// Validation for an authorization request and the consent decision, shared by
// GET and POST /api/oauth/authorize.

import { auth as adminAuth } from "../server/firebase";
import { findImpersonation } from "./client-identity";
import { getMcpResourceUrl, isOwnResource, normalizeScopes } from "./config";
import { getOAuthClient, type OAuthClient } from "./store";

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
  /** Always the canonical MCP resource URL, whether or not the client named it. */
  resource: string;
};

export type AuthorizeValidation =
  | { ok: true; client: OAuthClient; params: AuthorizeParams }
  | { ok: false; error: string; description: string; redirectable: boolean };

export type RawParams = Record<string, string | undefined>;

const MAX_PARAM_LENGTH = 2048;

/**
 * Validates an authorization request.
 *
 * `redirectable` marks errors that RFC 6749 says to report back to the client
 * via redirect_uri. Anything wrong with client_id or redirect_uri itself is not
 * redirectable and must be shown on Cadence's own page instead, or the endpoint
 * would be an open redirect. Even redirectable errors are only redirected for
 * a verified signed-in person; see the authorize route.
 */
export async function validateAuthorizeParams(
  raw: RawParams,
  request: { headers: Pick<Headers, "get"> },
): Promise<AuthorizeValidation> {
  const tooLong = Object.values(raw).some((value) => typeof value === "string" && value.length > MAX_PARAM_LENGTH);

  if (tooLong) {
    return { ok: false, error: "invalid_request", description: "A request parameter is too long.", redirectable: false };
  }

  const clientId = raw.client_id?.trim() || "";
  // Not trimmed: the redirect URI must match the registration byte for byte.
  const redirectUri = raw.redirect_uri || "";

  if (!clientId) {
    return { ok: false, error: "invalid_request", description: "client_id is required.", redirectable: false };
  }

  const client = await getOAuthClient(clientId);

  if (!client) {
    return {
      ok: false,
      error: "invalid_client",
      description: "This client is not registered with Cadence.",
      redirectable: false,
    };
  }

  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return {
      ok: false,
      error: "invalid_request",
      description: "redirect_uri does not match a registered redirect URI.",
      redirectable: false,
    };
  }

  // Not redirectable: the whole point is that this redirect URI is not to be
  // trusted, so the refusal is shown on Cadence rather than sent to it.
  const impersonation = findImpersonation(client.clientName, redirectUri);

  if (impersonation) {
    return { ok: false, error: "invalid_client", description: impersonation, redirectable: false };
  }

  if ((raw.response_type?.trim() || "") !== "code") {
    return {
      ok: false,
      error: "unsupported_response_type",
      description: "Only the authorization code response type is supported.",
      redirectable: true,
    };
  }

  const codeChallenge = raw.code_challenge?.trim() || "";

  // RFC 7636: base64url of a SHA-256 digest is exactly 43 characters.
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    return {
      ok: false,
      error: "invalid_request",
      description: "code_challenge is required (PKCE S256).",
      redirectable: true,
    };
  }

  if ((raw.code_challenge_method?.trim() || "") !== "S256") {
    return { ok: false, error: "invalid_request", description: "code_challenge_method must be S256.", redirectable: true };
  }

  // RFC 8707: a resource this server does not serve is refused outright
  // rather than silently mapped to the MCP endpoint.
  const requestedResource = raw.resource?.trim() || "";

  if (requestedResource && !isOwnResource(request, requestedResource)) {
    return {
      ok: false,
      error: "invalid_target",
      description: "The requested resource is not served by this authorization server.",
      redirectable: true,
    };
  }

  return {
    ok: true,
    client,
    params: {
      clientId,
      redirectUri,
      scopes: normalizeScopes(raw.scope),
      state: raw.state || undefined,
      codeChallenge,
      resource: getMcpResourceUrl(request),
    },
  };
}

export function buildRedirectWithError(redirectUri: string, error: string, description: string, state?: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);

  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export function buildRedirectWithCode(redirectUri: string, code: string, state: string | undefined, issuer: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);

  if (state) {
    url.searchParams.set("state", state);
  }

  // RFC 9207: lets a client that talks to several servers tell responses apart.
  url.searchParams.set("iss", issuer);

  return url.toString();
}

export type SignedInPerson = { uid: string; email?: string; name?: string };

/**
 * Verifies a Firebase ID token presented explicitly by the consent page.
 *
 * `checkRevoked` also refuses a token for a disabled account or one whose
 * sessions were revoked. Only a token issued for this Firebase project is
 * accepted, which verifyIdToken enforces through the audience and issuer.
 */
export async function verifyPersonIdToken(idToken: unknown): Promise<SignedInPerson | null> {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) {
    return null;
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);

    if (!decoded.uid) {
      return null;
    }

    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
    };
  } catch {
    return null;
  }
}
