// FILE: src/lib/oauth/metadata.ts
//
// Discovery documents for the connector:
//   /.well-known/oauth-protected-resource/api/mcp   RFC 9728 (and the bare path)
//   /.well-known/oauth-authorization-server         RFC 8414
import { AUTHORIZATION_PAGE_PATH, MCP_RESOURCE_NAME, SUPPORTED_SCOPES, getBaseUrl, getMcpResourceUrl } from "./config";
import { withCors } from "./cors";
import { jsonResponse } from "./request";

export function protectedResourceMetadata(request: Request) {
  const baseUrl = getBaseUrl(request);
  return withCors(
    jsonResponse(
      {
        resource: getMcpResourceUrl(request),
        authorization_servers: [baseUrl],
        scopes_supported: SUPPORTED_SCOPES,
        bearer_methods_supported: ["header"],
        resource_name: MCP_RESOURCE_NAME,
        resource_documentation: `${baseUrl}/connect`,
      },
      200,
      { "Cache-Control": "public, max-age=300" },
    ),
  );
}

export function authorizationServerMetadata(request: Request) {
  const baseUrl = getBaseUrl(request);
  return withCors(
    jsonResponse(
      {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}${AUTHORIZATION_PAGE_PATH}`,
        token_endpoint: `${baseUrl}/api/oauth/token`,
        registration_endpoint: `${baseUrl}/api/oauth/register`,
        revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
        scopes_supported: SUPPORTED_SCOPES,
        response_types_supported: ["code"],
        response_modes_supported: ["query"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
        revocation_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
      },
      200,
      { "Cache-Control": "public, max-age=300" },
    ),
  );
}
