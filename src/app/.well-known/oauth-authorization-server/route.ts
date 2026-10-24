// FILE: src/app/.well-known/oauth-authorization-server/route.ts
//
// RFC 8414 authorization server metadata.
import { corsPreflightResponse } from "@/lib/oauth/cors";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return authorizationServerMetadata(request);
}

export function OPTIONS() {
  return corsPreflightResponse();
}
