// FILE: src/lib/server/route.ts
//
// The guard every signed-in cloud route starts with: App Check where the route
// needs it, then a verified Firebase identity (ID token or session cookie).
// Also the catch-all that turns an unexpected throw into a plain 500 without
// leaking its message.
import { requireAppCheck } from "./app-check";
import { firebaseProjectId } from "./env";
import { errorResponse } from "./http";
import { cloudIdentity, type CloudIdentity } from "./identity";

export type Guarded = { ok: true; identity: CloudIdentity } | { ok: false; response: Response };

export async function requireCloudUser(request: Request, options: { appCheck?: boolean | "consume" } = {}): Promise<Guarded> {
  if (!firebaseProjectId()) return { ok: false, response: errorResponse(503, "cloud_unavailable", "Cadence Cloud isn't configured on this server.") };
  if (options.appCheck) {
    const check = await requireAppCheck(request, { consume: options.appCheck === "consume" });
    if (!check.ok) return check;
  }
  const identity = await cloudIdentity(request);
  if (!identity) return { ok: false, response: errorResponse(401, "unauthorized", "Sign in to continue.") };
  return { ok: true, identity };
}

export async function handled(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(`${label} failed:`, error instanceof Error ? error.message : error);
    return errorResponse(500, "server_error", "Something went wrong on our side. Try again.");
  }
}
