// FILE: src/lib/oauth/request.ts

/** Bodies larger than this are refused before parsing. OAuth requests are tiny. */
const MAX_BODY_BYTES = 64 * 1024;

export class BodyTooLargeError extends Error {}

async function readText(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");

  if (declared > MAX_BODY_BYTES) {
    throw new BodyTooLargeError("Request body is too large.");
  }

  const text = await request.text();

  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw new BodyTooLargeError("Request body is too large.");
  }

  return text;
}

/**
 * OAuth token and revocation requests are form-encoded per spec, but some
 * clients send JSON. Accept either and normalise to a flat string map; only
 * string values survive, so a JSON array or object can never stand in for a
 * parameter.
 */
export async function readOAuthFormBody(request: Request) {
  const values = new Map<string, string>();
  const contentType = request.headers.get("content-type") || "";
  const text = await readText(request);

  if (contentType.includes("application/json")) {
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === "string") {
          values.set(key, value);
        }
      });
    }

    return values;
  }

  // First value wins for a repeated parameter; RFC 6749 forbids repeats, and
  // taking the first consistently is safer than whichever a parser prefers.
  new URLSearchParams(text).forEach((value, key) => {
    if (!values.has(key)) {
      values.set(key, value);
    }
  });

  return values;
}

/** A JSON object body, or null when the body is not one. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const text = await readText(request);

  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...NO_STORE, ...headers },
  });
}

export function oauthErrorResponse(error: string, description: string, status = 400) {
  return jsonResponse({ error, error_description: description }, status);
}
