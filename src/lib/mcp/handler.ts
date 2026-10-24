// FILE: src/lib/mcp/handler.ts
//
// The whole of /api/mcp, kept out of the route file so the emulator tests run
// exactly what production runs. Stateless: a fresh server and transport per
// request, JSON responses, nothing kept in memory between requests. GET and
// DELETE answer 405 after authentication, so an unauthenticated client still
// gets the 401 challenge it needs for OAuth discovery.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Firestore } from "firebase-admin/firestore";

import { getBaseUrl } from "../oauth/config";
import { mcpPostOnlyResponse, withCors } from "../oauth/cors";
import { authenticateMcpRequest } from "../oauth/verify";
import { buildCadenceMcpServer, countToolCalls, limitToolCalls, rateLimitedBody } from "./server";

const MAX_BODY_BYTES = 256 * 1024;

function rpcError(status: number, code: number, message: string) {
  return withCors(new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), { status, headers: { "Content-Type": "application/json" } }));
}

export async function handleMcpPost(request: Request, options: { db?: Firestore } = {}): Promise<Response> {
  const auth = await authenticateMcpRequest(request);
  if (!auth.ok) return auth.response;

  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcError(400, -32700, "Parse error.");
  }

  const { token, clientId, scopes, resource, uid } = auth.context;
  const limited = await limitToolCalls(uid, countToolCalls(body), { db: options.db });
  if (!limited.allowed) {
    return withCors(new Response(JSON.stringify(rateLimitedBody(body, limited.retryAfterSeconds)), { status: 200, headers: { "Content-Type": "application/json", "Retry-After": String(limited.retryAfterSeconds) } }));
  }

  const server = buildCadenceMcpServer({ uid, scopes, origin: getBaseUrl(request), db: options.db });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      parsedBody: body,
      authInfo: { token, clientId, scopes, resource: new URL(resource), extra: { uid } },
    });
    return withCors(response);
  } catch (error) {
    console.error("MCP request failed", error instanceof Error ? error.message : error);
    return rpcError(500, -32603, "Internal server error");
  } finally {
    // Safe: with JSON responses handleRequest resolves with a finished body.
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

/** GET and DELETE: authenticate, then 405. */
export async function handleMcpPostOnly(request: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(request);
  return auth.ok ? mcpPostOnlyResponse() : auth.response;
}
