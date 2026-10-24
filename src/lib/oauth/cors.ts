// FILE: src/lib/oauth/cors.ts

const ALLOWED_HEADERS = ["Authorization", "Content-Type", "Mcp-Session-Id", "MCP-Protocol-Version", "Last-Event-ID"].join(", ");

const EXPOSED_HEADERS = ["WWW-Authenticate", "Mcp-Session-Id"].join(", ");

/**
 * Browser-based MCP clients call the MCP and OAuth endpoints cross-origin. A
 * wildcard origin is safe because nothing here is authorised by a cookie:
 * every protected route reads an explicit bearer token, and the consent
 * endpoint reads a Firebase ID token from the request body. A cross-site page
 * can send requests, but has nothing ambient to send them with.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Expose-Headers": EXPOSED_HEADERS,
  "Access-Control-Max-Age": "86400",
};

export function withCors<T extends Response>(response: T) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function corsPreflightResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET and DELETE on a stateless MCP endpoint: there is no SSE stream to open
 * and no session to end, so the answer is 405, after authentication, and
 * clients stop retrying. Building a whole server for them instead let one
 * client's reconnect loop push a container past its memory limit.
 */
export function mcpPostOnlyResponse() {
  return withCors(new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }));
}
