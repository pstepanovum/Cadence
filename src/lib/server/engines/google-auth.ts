// FILE: src/lib/server/engines/google-auth.ts
//
// Google credentials for the cloud engines, with no key in the environment:
//
//   accessToken()   an OAuth access token for Vertex AI, Cloud Text-to-Speech
//                   and Cloud Storage, from Application Default Credentials
//                   (the cadence-web service account on Cloud Run).
//   idToken(url)    a Google-signed ID token whose audience is the cadence-ai
//                   service, from the metadata server. cadence-ai runs with
//                   --no-allow-unauthenticated, so this is the only way in.
//
// Both are cached per instance until shortly before they expire.
import { applicationDefault } from "firebase-admin/app";

const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const MARGIN_MS = 5 * 60 * 1000;

let access: { token: string; expiresAt: number } | null = null;
const identity = new Map<string, { token: string; expiresAt: number }>();

export async function accessToken(): Promise<string> {
  if (access && access.expiresAt - MARGIN_MS > Date.now()) return access.token;
  const result = await applicationDefault().getAccessToken();
  access = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return access.token;
}

/** Decodes a JWT's exp without verifying it; the token came from the metadata server. */
function expiryOf(jwt: string): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : Date.now() + 30 * 60 * 1000;
  } catch {
    return Date.now() + 30 * 60 * 1000;
  }
}

export async function idToken(serviceUrl: string): Promise<string> {
  const audience = new URL(serviceUrl).origin;
  const cached = identity.get(audience);
  if (cached && cached.expiresAt - MARGIN_MS > Date.now()) return cached.token;
  const response = await fetch(`${METADATA}?audience=${encodeURIComponent(audience)}&format=full`, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`The metadata server refused an ID token (${response.status}).`);
  const token = (await response.text()).trim();
  identity.set(audience, { token, expiresAt: expiryOf(token) });
  return token;
}

/**
 * Whether calls to the AI engine carry an ID token. On by default for an https
 * engine URL (cadence-ai on Cloud Run); a local engine on http needs none.
 * ENGINE_AUTH=none or ENGINE_AUTH=google-id-token overrides it.
 */
export function engineNeedsIdToken(url: string, env: Record<string, string | undefined> = process.env): boolean {
  const mode = env.ENGINE_AUTH?.trim();
  if (mode === "none") return false;
  if (mode === "google-id-token") return true;
  return url.startsWith("https://");
}
