// FILE: src/app/api/oauth/revoke/route.ts
//
// RFC 7009. Always 200, even for an unknown token, so it cannot be used to
// probe which tokens exist. Revoking any token ends its whole grant.
import { corsPreflightResponse, withCors } from "@/lib/oauth/cors";
import { BodyTooLargeError, jsonResponse, readOAuthFormBody } from "@/lib/oauth/request";
import { revokeToken } from "@/lib/oauth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readOAuthFormBody(request);
    const token = body.get("token");
    if (token) await revokeToken(token, body.get("client_id") || undefined);
  } catch (caught) {
    if (!(caught instanceof BodyTooLargeError)) throw caught;
  }
  return withCors(jsonResponse({}, 200));
}

export function OPTIONS() {
  return corsPreflightResponse();
}
