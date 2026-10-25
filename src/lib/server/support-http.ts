// FILE: src/lib/server/support-http.ts
//
// The support routes, as plain Request -> Response handlers so the emulator
// tests run them without Next.js. The route files under src/app/api only add
// after() delivery.
//
//   POST  /api/support          {email, topic, message, name?, platform?, website?}
//                               anyone; a signed-in writer's uid is attached
//   GET   /api/admin/support    ?status=open|answered|closed   the owner's list
//   PATCH /api/admin/support    {id, status}
//   POST  /api/admin/support    {id, message, by?}            reply by email
//
// `website` is a field people never see: a filled one is a bot, answered as if
// accepted and kept nowhere. Five messages an hour per address and ten a day
// per email, shared by every instance (rateLimits). The admin routes take
// `Authorization: Bearer <ADMIN_SECRET>` (admin-auth.ts).
import { SUPPORT_STATUSES, checkSupportRequest, type SupportStatus } from "../support-request";
import { isAdminAuthorized } from "./admin-auth";
import { requireAppCheck } from "./app-check";
import { firebaseProjectId } from "./env";
import { BodyTooLargeError, clientIp, errorResponse, json, readJsonObject } from "./http";
import { cloudIdentity } from "./identity";
import { LIMITS, hitAll } from "./rate-limit";
import { getSupportRequest, listSupportRequests, replyToSupportRequest, setSupportStatus, submitSupportRequest } from "./support";

export interface HandlerDeps {
  /** Called with mail keys to deliver after the response; the route passes after(() => deliverSoon(keys)). */
  deliver?: (keys: string[]) => void;
}

const MAX_BODY_BYTES = 16 * 1024;
const ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;

async function readBody(request: Request, max = MAX_BODY_BYTES): Promise<Record<string, unknown> | Response> {
  try {
    return (await readJsonObject(request, max)) ?? errorResponse(400, "bad_request", "Send a JSON object.");
  } catch (error) {
    if (error instanceof BodyTooLargeError) return errorResponse(413, "too_large", "That message is too long.");
    throw error;
  }
}

export async function handleSupportPost(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  if (!firebaseProjectId()) return errorResponse(503, "not_configured", "The contact form isn't available here. Email support@cadence.pstepanov.dev instead.");
  const check = await requireAppCheck(request);
  if (!check.ok) return check.response;

  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });

  const checked = checkSupportRequest(body);
  if (!checked.ok) return errorResponse(400, "bad_request", checked.message, { field: checked.field });

  const limit = await hitAll([
    { rule: LIMITS.supportIpHour, subject: clientIp(request) },
    { rule: LIMITS.supportEmailDay, subject: checked.request.email },
  ]);
  if (!limit.allowed) {
    return errorResponse(429, "rate_limited", "Thanks, we have your messages. If there's more, try again in an hour.", { retryAfterSeconds: limit.retryAfterSeconds });
  }

  const identity = await cloudIdentity(request).catch(() => null);
  const { mailKey } = await submitSupportRequest(checked.request, { uid: identity?.uid, userAgent: request.headers.get("user-agent") ?? "" });
  deps.deliver?.([mailKey]);
  return json({ ok: true });
}

function unauthorized(request: Request): Response | null {
  return isAdminAuthorized(request.headers.get("authorization")) ? null : errorResponse(401, "unauthorized", "Not allowed.");
}

export async function handleAdminSupportGet(request: Request): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const status = new URL(request.url).searchParams.get("status");
  if (status && !SUPPORT_STATUSES.includes(status as SupportStatus)) return errorResponse(400, "bad_request", "status is open, answered or closed.");
  return json({ requests: await listSupportRequests({ status: (status as SupportStatus | null) ?? undefined }) });
}

export async function handleAdminSupportPatch(request: Request): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const id = typeof body.id === "string" ? body.id : "";
  if (!ID_PATTERN.test(id)) return errorResponse(400, "bad_request", "id is required.");
  if (!SUPPORT_STATUSES.includes(body.status as SupportStatus)) return errorResponse(400, "bad_request", "status is open, answered or closed.");
  if (!(await setSupportStatus(id, body.status as SupportStatus))) return errorResponse(404, "not_found", "No such request.");
  return json({ request: await getSupportRequest(id) });
}

export async function handleAdminSupportReply(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const body = await readBody(request, 32 * 1024);
  if (body instanceof Response) return body;
  const id = typeof body.id === "string" ? body.id : "";
  if (!ID_PATTERN.test(id)) return errorResponse(400, "bad_request", "id is required.");
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "owner";
  const result = await replyToSupportRequest(id, body.message, { by });
  if (!result.ok) return errorResponse(result.reason === "not_found" ? 404 : 400, result.reason === "not_found" ? "not_found" : "bad_request", result.message);
  deps.deliver?.([result.mailKey]);
  return json({ request: result.request });
}
