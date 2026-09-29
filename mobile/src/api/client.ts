// FILE: mobile/src/api/client.ts
import { supabase } from "@/lib/supabase";
import { requireTransport, type Transport } from "@/api/transport";

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

async function authHeader(transport: Transport): Promise<Record<string, string>> {
  // A paired computer authenticates the device, not a person: there is no
  // account in local mode, and the device token is the whole identity.
  if (transport.mode === "local") {
    return transport.deviceToken ? { Authorization: `Bearer ${transport.deviceToken}` } : {};
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const transport = requireTransport();

  const headers = {
    ...(await authHeader(transport)),
    ...(init.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${transport.baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    if (transport.mode === "cloud") {
      await supabase.auth.signOut();
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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);

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

export function apiJson<T>(path: string, method: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
