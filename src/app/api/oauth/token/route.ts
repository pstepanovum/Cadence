// FILE: src/app/api/oauth/token/route.ts
//
// The token endpoint: authorization_code (PKCE S256, single-use code, a reused
// code revokes its grant) and refresh_token (rotation with reuse detection,
// 180-day grant ceiling). Public clients only. The first token of a new grant
// queues the "connector authorized" email.
import { getBaseUrl, getMcpResourceUrl, parseScopeString } from "@/lib/oauth/config";
import { describeRedirectTarget } from "@/lib/oauth/client-identity";
import { corsPreflightResponse, withCors } from "@/lib/oauth/cors";
import { BodyTooLargeError, jsonResponse, oauthErrorResponse, readOAuthFormBody } from "@/lib/oauth/request";
import { getOAuthClient, redeemAuthorizationCode, rotateRefreshToken, type IssuedTokenSet } from "@/lib/oauth/store";
import { deliverSoon, mailKey, queueMail } from "@/lib/server/email/queue";
import { clientIp } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";
import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (code: string, description: string, status = 400) => withCors(oauthErrorResponse(code, description, status));

function tokenResponse(tokens: IssuedTokenSet) {
  return withCors(
    jsonResponse({
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scopes.join(" "),
    }),
  );
}

export async function POST(request: Request) {
  const limit = await hitRateLimit(LIMITS.oauthTokenIpMinute, clientIp(request));
  if (!limit.allowed) return error("slow_down", "Too many token requests. Try again shortly.", 429);

  let body: Map<string, string>;
  try {
    body = await readOAuthFormBody(request);
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return error("invalid_request", caught.message, 413);
    throw caught;
  }

  const clientId = body.get("client_id") || "";
  if (!clientId) return error("invalid_client", "client_id is required.", 401);
  const client = await getOAuthClient(clientId);
  if (!client) return error("invalid_client", "Unknown client_id.", 401);

  const grantType = body.get("grant_type");
  const resource = body.get("resource") || undefined;
  if (resource && resource.replace(/\/+$/, "") !== getMcpResourceUrl(request)) {
    return error("invalid_target", "This server issues tokens only for its own MCP endpoint.");
  }

  if (grantType === "authorization_code") {
    const code = body.get("code") || "";
    const codeVerifier = body.get("code_verifier") || "";
    const redirectUri = body.get("redirect_uri") || "";
    if (!code || !codeVerifier || !redirectUri) return error("invalid_request", "code, code_verifier and redirect_uri are required.");

    const outcome = await redeemAuthorizationCode({ code, clientId, redirectUri, codeVerifier, resource });
    if (!outcome.ok) return error(outcome.error, outcome.description);

    const key = mailKey("mcp", outcome.grantId);
    const queued = await queueMail(key, {
      template: "mcp-authorized",
      uid: outcome.uid,
      props: { clientName: client.clientName, destination: describeRedirectTarget(redirectUri).destination, scopes: outcome.tokens.scopes, at: Date.now() },
    }).catch(() => false);
    if (queued) after(() => deliverSoon([key]));
    return tokenResponse(outcome.tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = body.get("refresh_token") || "";
    if (!refreshToken) return error("invalid_request", "refresh_token is required.");
    const outcome = await rotateRefreshToken({ token: refreshToken, clientId, requestedScopes: parseScopeString(body.get("scope")), resource });
    if (!outcome.ok) return error(outcome.error, outcome.description);
    return tokenResponse(outcome.tokens);
  }

  return error("unsupported_grant_type", `Supported grant types are authorization_code and refresh_token (issuer ${getBaseUrl(request)}).`);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
