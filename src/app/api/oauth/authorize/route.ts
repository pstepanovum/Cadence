// FILE: src/app/api/oauth/authorize/route.ts
//
// The consent page's backend (the page itself is /oauth/authorize in the web
// app). Two verbs:
//
//   GET   describes an authorization request so the page can render it:
//         who asks, where the code goes, which permissions. Needs the
//         learner's Firebase ID token as `Authorization: Bearer`.
//   POST  {…the authorize parameters, decision: "allow"|"deny", scope, id_token}
//         records the decision and answers {redirect} for the page to follow.
//
// No cookie authorises anything here: the identity is only the ID token the
// page sends explicitly, so a cross-site page cannot act as the learner. POST
// also requires JSON, which a plain HTML form cannot send. No CORS headers:
// only Cadence's own page calls this. Every parameter is re-validated on each
// call, since both verbs are reachable by anyone.
import {
  buildRedirectWithCode,
  buildRedirectWithError,
  validateAuthorizeParams,
  verifyPersonIdToken,
  type RawParams,
  type SignedInPerson,
} from "@/lib/oauth/authorize";
import { describeRedirectTarget, sanitizeClientName } from "@/lib/oauth/client-identity";
import { MCP_RESOURCE_NAME, SCOPE_DESCRIPTIONS, SUPPORTED_SCOPES, filterSupportedScopes, getBaseUrl } from "@/lib/oauth/config";
import { BodyTooLargeError, jsonResponse, readJsonObject } from "@/lib/oauth/request";
import { createAuthorizationCode } from "@/lib/oauth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "resource", "scope"] as const;

function pickParams(source: (key: string) => unknown): RawParams {
  const raw: RawParams = {};
  for (const field of FIELDS) {
    const value = source(field);
    if (typeof value === "string") raw[field] = value;
  }
  return raw;
}

const error = (status: number, code: string, description: string) => jsonResponse({ error: code, error_description: description }, status);

/** Redirect an invalid request back to the client only for a verified signed-in learner; otherwise show it here. */
function invalid(validation: { error: string; description: string; redirectable: boolean }, raw: RawParams, person: SignedInPerson | null) {
  if (validation.redirectable && person && raw.redirect_uri) {
    return jsonResponse({ redirect: buildRedirectWithError(raw.redirect_uri, validation.error, validation.description, raw.state) });
  }
  return error(400, validation.error, validation.description);
}

function bearerFrom(request: Request) {
  const match = /^\s*bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = pickParams((key) => url.searchParams.get(key) ?? undefined);
  const [validation, person] = await Promise.all([validateAuthorizeParams(raw, request), verifyPersonIdToken(bearerFrom(request))]);
  if (!validation.ok) return invalid(validation, raw, person);
  if (!person) return error(401, "login_required", "Sign in to Cadence to review this request.");

  const { client, params } = validation;
  const target = describeRedirectTarget(params.redirectUri);
  return jsonResponse({
    client: { id: client.clientId, name: sanitizeClientName(client.clientName) },
    redirectUri: params.redirectUri,
    destination: target.destination,
    loopback: target.loopback,
    resource: params.resource,
    resourceName: MCP_RESOURCE_NAME,
    requestedScopes: params.scopes,
    availableScopes: SUPPORTED_SCOPES.map((scope) => ({ scope, description: SCOPE_DESCRIPTIONS[scope] })),
    account: { email: person.email ?? null, name: person.name ?? null },
  });
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return error(415, "invalid_request", "Send the decision as JSON.");
  }
  let body: Record<string, unknown> | null;
  try {
    body = await readJsonObject(request);
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return error(413, "invalid_request", caught.message);
    throw caught;
  }
  if (!body) return error(400, "invalid_request", "Request body must be a JSON object.");

  const raw = pickParams((key) => body[key]);
  const person = await verifyPersonIdToken(body.id_token);
  if (!person) return error(401, "login_required", "Sign in to Cadence to approve or deny this request.");

  const validation = await validateAuthorizeParams(raw, request);
  if (!validation.ok) return invalid(validation, raw, person);
  const { params } = validation;

  if (body.decision !== "allow") {
    return jsonResponse({ redirect: buildRedirectWithError(params.redirectUri, "access_denied", "The learner denied this request.", params.state) });
  }

  const code = await createAuthorizationCode({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scopes: filterSupportedScopes(raw.scope),
    codeChallenge: params.codeChallenge,
    resource: params.resource,
    uid: person.uid,
  });
  return jsonResponse({ redirect: buildRedirectWithCode(params.redirectUri, code, params.state, getBaseUrl(request)) });
}
