// FILE: src/app/.well-known/oauth-protected-resource/api/mcp/route.ts
//
// RFC 9728 metadata for the MCP connector. App Router serves .well-known
// folders as ordinary route segments.
import { corsPreflightResponse } from "@/lib/oauth/cors";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return protectedResourceMetadata(request);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
