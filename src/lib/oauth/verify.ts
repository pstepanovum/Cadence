// FILE: src/lib/oauth/verify.ts
//
// Bearer authentication for /api/mcp, with the RFC 9728 challenge on every
// refusal so a client that has never seen Cadence can discover where to sign in.

import { getMcpResourceUrl, getResourceMetadataUrl } from "./config";
import { withCors } from "./cors";
import { verifyAccessToken, type TokenRecord } from "./store";

/** The raw token is carried through so it can populate the SDK's AuthInfo. */
export type McpAuthContext = TokenRecord & { token: string };

type AuthResult = { ok: true; context: McpAuthContext } | { ok: false; response: Response };

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");

  if (!header) {
    return null;
  }

  const match = /^\s*bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * RFC 9728 challenge. The resource_metadata pointer is how a client that has
 * never seen this server discovers where to authorize, so it is present on
 * every 401 the MCP endpoint returns.
 */
function challengeResponse(request: Request, status: number, error: string, description: string) {
  const challenge = [
    `Bearer resource_metadata="${getResourceMetadataUrl(request)}"`,
    `error="${error}"`,
    `error_description="${description}"`,
  ].join(", ");

  return withCors(
    new Response(JSON.stringify({ error, error_description: description }), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "WWW-Authenticate": challenge },
    }),
  );
}

export async function authenticateMcpRequest(request: Request): Promise<AuthResult> {
  const token = getBearerToken(request);

  if (!token) {
    return {
      ok: false,
      response: challengeResponse(request, 401, "invalid_request", "Authorization header with a Bearer access token is required."),
    };
  }

  const context = await verifyAccessToken(token);

  if (!context) {
    return {
      ok: false,
      response: challengeResponse(request, 401, "invalid_token", "The access token is invalid or has expired."),
    };
  }

  // RFC 8707 audience binding: a token minted for a different resource must
  // not be replayable here. A token with no resource at all is refused too;
  // skipping the check when the field is empty would let such a token work
  // anywhere.
  if (!context.resource || context.resource !== getMcpResourceUrl(request)) {
    return {
      ok: false,
      response: challengeResponse(request, 401, "invalid_token", "The access token was not issued for this resource."),
    };
  }

  return { ok: true, context: { ...context, token } };
}
