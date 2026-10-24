// FILE: mobile/src/api/client.ts
import { signOut } from "firebase/auth";

import { requireAiTransport, requireTransport, type Transport } from "@/api/transport";
import { appCheckHeaders } from "@/lib/app-check";
import { getFirebaseAuth } from "@/lib/firebase";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Protocol error code when the server sent one, e.g. "device_revoked". */
    public code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeader(
  transport: Transport,
  forceRefresh = false,
): Promise<Record<string, string>> {
  // A paired computer authenticates the device, not a person: there is no
  // account in local mode, and the device token is the whole identity.
  if (transport.mode === "local") {
    return transport.deviceToken ? { Authorization: `Bearer ${transport.deviceToken}` } : {};
  }

  // The SDK hands back the cached ID token and refreshes it first when it is
  // close to expiry, so this is cheap on every call.
  const user = getFirebaseAuth()?.currentUser;
  if (!user) return {};
  const token = await user.getIdToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

function send(
  transport: Transport,
  path: string,
  init: RequestInit,
  auth: Record<string, string>,
): Promise<Response> {
  return fetch(`${transport.baseUrl}${path}`, {
    ...init,
    headers: { ...auth, ...(init.headers as Record<string, string> | undefined) },
  });
}

export interface FetchOptions {
  /** An AI request: goes to the paired server when it is connected. */
  ai?: boolean;
  /** Attach a Firebase App Check token (cloud AI, sync and newsletter routes). */
  appCheck?: boolean;
}

async function headersFor(transport: Transport, options: FetchOptions, forceRefresh = false) {
  const auth = await authHeader(transport, forceRefresh);
  // App Check proves the request comes from this app; only the hosted API
  // checks it, so a paired server never gets one.
  const appCheck = transport.mode === "cloud" && (options.appCheck || options.ai) ? await appCheckHeaders() : {};
  return { ...auth, ...appCheck };
}

export async function apiFetch(path: string, init: RequestInit = {}, options: FetchOptions = {}): Promise<Response> {
  const transport = options.ai ? requireAiTransport() : requireTransport();

  let response = await send(transport, path, init, await headersFor(transport, options));

  // A token can be revoked or expire between the SDK's check and the server's,
  // so a cloud 401 gets one retry with a freshly minted token before the
  // person is signed out. The retry resends the same body, which is fine for
  // the strings and FormData this client sends.
  if (response.status === 401 && transport.mode === "cloud" && getFirebaseAuth()?.currentUser) {
    const refreshed = await headersFor(transport, options, true).catch(() => null);
    if (refreshed) {
      response = await send(transport, path, init, refreshed);
    }
  }

  if (response.status === 401) {
    if (transport.mode === "cloud") {
      const auth = getFirebaseAuth();
      if (auth) await signOut(auth).catch(() => {});
      throw new ApiError(401, "Your session has expired. Please sign in again.");
    }

    // Local mode: the computer unpaired this phone, or the pairing aged out.
    // The connection provider watches for these codes and clears the keychain,
    // so the message is about the computer, not about a login.
    const body = (await response.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;

    throw new ApiError(
      401,
      body?.error ?? "This phone is no longer paired with your computer.",
      body?.code ?? "device_revoked",
    );
  }

  return response;
}

export async function api<T>(path: string, init: RequestInit = {}, options: FetchOptions = {}): Promise<T> {
  const response = await apiFetch(path, init, options);

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let code: string | null = null;
    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        code?: string;
      };
      message = body.error ?? body.message ?? message;
      code = body.code ?? null;
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new ApiError(response.status, message, code);
  }

  return (await response.json()) as T;
}

export function apiJson<T>(path: string, method: string, body: unknown, options: FetchOptions = {}): Promise<T> {
  return api<T>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

/**
 * Headers for an AI request made outside fetch, such as the reference-audio
 * download: the device token at home, or the ID token and App Check token in
 * the cloud.
 */
export function aiRequestHeaders(): Promise<Record<string, string>> {
  return headersFor(requireAiTransport(), { ai: true });
}
