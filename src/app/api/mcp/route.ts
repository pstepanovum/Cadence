// FILE: src/app/api/mcp/route.ts
//
// The Cadence MCP connector: https://cadence.pstepanov.dev/api/mcp.
// Streamable HTTP, stateless, JSON responses, OAuth 2.1 (src/lib/oauth).
// The handling lives in src/lib/mcp/handler.ts.
import { handleMcpPost, handleMcpPostOnly } from "@/lib/mcp/handler";
import { corsPreflightResponse } from "@/lib/oauth/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleMcpPost(request);
}

export function GET(request: Request) {
  return handleMcpPostOnly(request);
}

export function DELETE(request: Request) {
  return handleMcpPostOnly(request);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
