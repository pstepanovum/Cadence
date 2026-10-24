// FILE: src/app/api/oauth/register/route.ts
//
// RFC 7591 dynamic client registration. Open on purpose: it hands out only a
// public client id, and no token is minted without the learner signing in on
// the consent page. Rate limited per IP so it cannot be used to fill the
// collection.
import { findImpersonation, sanitizeClientName } from "@/lib/oauth/client-identity";
import { SUPPORTED_SCOPES } from "@/lib/oauth/config";
import { corsPreflightResponse, withCors } from "@/lib/oauth/cors";
import { MAX_REDIRECT_URIS, isAllowedRedirectUri } from "@/lib/oauth/redirect-uri";
import { BodyTooLargeError, jsonResponse, oauthErrorResponse, readJsonObject } from "@/lib/oauth/request";
import { registerOAuthClient } from "@/lib/oauth/store";
import { clientIp } from "@/lib/server/http";
import { LIMITS, hitRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (code: string, description: string, status = 400) => withCors(oauthErrorResponse(code, description, status));

export async function POST(request: Request) {
  const limit = await hitRateLimit(LIMITS.oauthRegisterIpHour, clientIp(request));
  if (!limit.allowed) return error("slow_down", "Too many registrations from this address. Try again later.", 429);

  let body: Record<string, unknown> | null;
  try {
    body = await readJsonObject(request);
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return error("invalid_client_metadata", caught.message, 413);
    throw caught;
  }
  if (!body) return error("invalid_client_metadata", "Request body must be a JSON object.");

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string" && uri.length > 0) : [];
  if (redirectUris.length === 0) return error("invalid_redirect_uri", "At least one redirect_uris entry is required.");
  if (redirectUris.length > MAX_REDIRECT_URIS) return error("invalid_redirect_uri", `A client may register at most ${MAX_REDIRECT_URIS} redirect URIs.`);
  const invalid = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
  if (invalid) return error("invalid_redirect_uri", "A redirect URI is not allowed.");

  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (method !== "none") return error("invalid_client_metadata", "Cadence issues public clients only; use token_endpoint_auth_method 'none' with PKCE.");

  const clientName = sanitizeClientName(typeof body.client_name === "string" ? body.client_name : "");
  for (const uri of redirectUris) {
    const impersonation = findImpersonation(clientName, uri);
    if (impersonation) return error("invalid_client_metadata", impersonation);
  }

  const client = await registerOAuthClient({ clientName, redirectUris });
  return withCors(
    jsonResponse(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: SUPPORTED_SCOPES.join(" "),
      },
      201,
    ),
  );
}

export function OPTIONS() {
  return corsPreflightResponse();
}
