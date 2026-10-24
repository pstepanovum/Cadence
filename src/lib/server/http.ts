// FILE: src/lib/server/http.ts
//
// Small response and request helpers shared by every route under src/app/api.
// Uses only the web platform's Request and Response, so it runs in route
// handlers and in node --test alike.

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** `{error, message}` with a machine-readable code the apps switch on. */
export function errorResponse(status: number, error: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json({ error, message, ...extra }, status, headers);
}

export class BodyTooLargeError extends Error {}

/** Reads a body as text with a hard cap, so a huge upload cannot exhaust memory. */
export async function readTextCapped(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(`Body is larger than ${maxBytes} bytes.`);
  const bytes = await readBytesCapped(request, maxBytes);
  return new TextDecoder().decode(bytes);
}

export async function readBytesCapped(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(`Body is larger than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** A JSON object body, or null when it is not one. Throws BodyTooLargeError past the cap. */
export async function readJsonObject(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown> | null> {
  const text = await readTextCapped(request, maxBytes);
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** How many proxies in front of the server append to X-Forwarded-For (TRUSTED_PROXY_HOPS, default 1). */
export function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 1;
}

/**
 * The caller's address for per-IP limits. Every proxy appends the address it
 * saw to X-Forwarded-For, so everything left of the trusted hops is whatever
 * the client chose to send. With N trusted hops the client is the Nth entry
 * from the right: Cloud Run alone is 1, Firebase Hosting in front of it is 2.
 * Only used as a rate-limit key, never for anything that grants access.
 */
export function clientIp(request: Request, hops = trustedProxyHops()): string {
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = chain.length > 0 ? chain[Math.max(0, chain.length - hops)] : request.headers.get("x-real-ip")?.trim() || "unknown";
  return /^[0-9a-fA-F:.]{2,45}$/.test(candidate) ? candidate : "unknown";
}

export function bearerToken(request: Request): string | null {
  const match = /^\s*bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

/** True for a request whose Origin, when present, is the server's own. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
