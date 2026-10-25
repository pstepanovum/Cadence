// FILE: src/lib/server/codes/http.ts
//
// The friend-code routes, as plain Request -> Response handlers (the route
// files under src/app/api only re-export them).
//
// For the owner's dashboard, `Authorization: Bearer <ADMIN_SECRET>`; the same
// contract as the other apps it manages:
//
//   GET   /api/admin/codes   every code with its redemptions        {codes}
//   POST  /api/admin/codes   {label, code?, durationDays, maxRedemptions, expiresAt: ms|null, createdBy?}   201 {code}
//   PATCH /api/admin/codes   {action: "disable"|"enable", codeId}   {ok}
//                            {action: "revoke", codeId, uid}        {ok, result, grantDeleted}
//
// For the website's /redeem page only (the iPhone app never offers codes),
// with the signed-in account's Firebase ID token:
//
//   GET  /api/codes/redeem?code=   what the code gives, without taking it  {durationDays, duration}
//   POST /api/codes/redeem         {code}  {redeemed, durationDays, duration, expiresAt}
//
// Errors are {error, error_description, message}: the dashboard reads
// error_description, Cadence's own pages read message.
import { isAdminAuthorized } from "../admin-auth";
import { firebaseProjectId } from "../env";
import { BodyTooLargeError, json, readJsonObject } from "../http";
import { cloudIdentity } from "../identity";
import { describeGrantDuration, parseCreateCodeInput, redeemFailureMessage } from "./logic";
import { createCode, listCodes, previewCode, redeemCode, revokeRedemption, setCodeDisabled } from "./store";

const ID_PATTERN = /^[a-f0-9]{64}$/;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function error(status: number, code: string, description: string): Response {
  return json({ error: code, error_description: description, message: description }, status);
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return error(415, "invalid_request", "Send the request as JSON.");
  }
  try {
    return (await readJsonObject(request, 16 * 1024)) ?? error(400, "invalid_request", "Send a JSON object.");
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) return error(413, "invalid_request", caught.message);
    throw caught;
  }
}

const denied = (request: Request) => (isAdminAuthorized(request.headers.get("authorization")) ? null : error(401, "unauthorized", "Not allowed."));

export async function handleAdminCodesGet(request: Request): Promise<Response> {
  const refusal = denied(request);
  if (refusal) return refusal;
  return json({ codes: await listCodes() });
}

export async function handleAdminCodesPost(request: Request): Promise<Response> {
  const refusal = denied(request);
  if (refusal) return refusal;
  const body = await readBody(request);
  if (body instanceof Response) return body;

  const input = parseCreateCodeInput(body, Date.now());
  if (typeof input === "string") return error(400, "invalid_request", input);

  const createdBy = typeof body.createdBy === "string" && body.createdBy.trim() ? body.createdBy.trim().slice(0, 120) : "owner";
  const created = await createCode(input, createdBy);
  if (created === "taken") return error(409, "code_taken", "That code already exists. Choose another.");
  return json({ code: created }, 201);
}

export async function handleAdminCodesPatch(request: Request): Promise<Response> {
  const refusal = denied(request);
  if (refusal) return refusal;
  const body = await readBody(request);
  if (body instanceof Response) return body;

  const codeId = typeof body.codeId === "string" ? body.codeId : "";
  if (!ID_PATTERN.test(codeId)) return error(400, "invalid_request", "codeId is required.");

  if (body.action === "disable" || body.action === "enable") {
    const found = await setCodeDisabled(codeId, body.action === "disable");
    return found ? json({ ok: true }) : error(404, "not_found", "No such code.");
  }

  if (body.action === "revoke") {
    const uid = typeof body.uid === "string" ? body.uid : "";
    if (!UID_PATTERN.test(uid)) return error(400, "invalid_request", "uid is required.");
    const outcome = await revokeRedemption(codeId, uid);
    if (outcome.result === "not_found") return error(404, "not_found", "No such redemption.");
    return json({ ok: true, ...outcome });
  }

  return error(400, "invalid_request", 'action is "disable", "enable", or "revoke".');
}

/** The signed-in cloud account, or the response to send. */
async function account(request: Request): Promise<{ uid: string; email: string | null } | Response> {
  if (!firebaseProjectId()) return error(503, "cloud_unavailable", "Redeem codes at cadence.pstepanov.dev/redeem.");
  const identity = await cloudIdentity(request);
  if (!identity) return error(401, "login_required", "Sign in to redeem a code.");
  return { uid: identity.uid, email: identity.email };
}

export async function handleRedeemGet(request: Request): Promise<Response> {
  const who = await account(request);
  if (who instanceof Response) return who;
  const result = await previewCode(who.uid, new URL(request.url).searchParams.get("code"));
  if (result.ok) return json({ durationDays: result.durationDays, duration: describeGrantDuration(result.durationDays) });
  if (result.reason === "rate_limited") return error(429, "rate_limited", "Too many tries. Try again in an hour.");
  return error(400, "invalid_code", redeemFailureMessage(result.reason));
}

export async function handleRedeemPost(request: Request): Promise<Response> {
  const who = await account(request);
  if (who instanceof Response) return who;
  const body = await readBody(request);
  if (body instanceof Response) return body;

  const result = await redeemCode(who.uid, body.code, { email: who.email });
  if (result.ok) {
    return json({ redeemed: true, durationDays: result.durationDays, duration: describeGrantDuration(result.durationDays), expiresAt: result.expiresAt });
  }
  if (result.reason === "rate_limited") return error(429, "rate_limited", "Too many tries. Try again in an hour.");
  if (result.reason === "account_deleted") return error(401, "login_required", "Sign in again to redeem a code.");
  return error(400, "invalid_code", redeemFailureMessage(result.reason));
}
