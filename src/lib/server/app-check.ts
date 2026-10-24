// FILE: src/lib/server/app-check.ts
//
// Firebase App Check on every cloud AI, sync and newsletter route: App Attest
// on iOS, reCAPTCHA Enterprise on the web, the debug provider in development
// (debug tokens are registered in the Firebase console and verify like any
// other). The client sends its token in X-Firebase-AppCheck. MCP uses OAuth
// instead and never comes through here.
//
// `consume: true` turns on replay protection: the token is spent on first use,
// for the routes an abuser would script (newsletter, sign-up follow-ups).
import { getAppCheck } from "firebase-admin/app-check";

import { isAppCheckEnforced, type Env } from "./env";
import { adminAppInstance } from "./firebase";
import { errorResponse } from "./http";

export const APP_CHECK_HEADER = "x-firebase-appcheck";

export type AppCheckOutcome = { ok: true; appId: string | null } | { ok: false; response: Response };

export interface AppCheckOptions {
  /** Spend the token so it cannot be replayed. */
  consume?: boolean;
  env?: Env;
  /** For tests: a verifier in place of the Admin SDK. */
  verify?: (token: string, consume: boolean) => Promise<{ appId: string; alreadyConsumed?: boolean }>;
}

const refused = () =>
  errorResponse(401, "app_check_failed", "This app could not be verified. Update Cadence and try again.");

export async function requireAppCheck(request: Request, options: AppCheckOptions = {}): Promise<AppCheckOutcome> {
  if (!isAppCheckEnforced(options.env)) return { ok: true, appId: null };

  const token = request.headers.get(APP_CHECK_HEADER)?.trim();
  if (!token || token.length > 4096) return { ok: false, response: refused() };

  const consume = options.consume === true;
  const verify =
    options.verify ??
    (async (value: string, spend: boolean) => {
      const result = await getAppCheck(adminAppInstance()).verifyToken(value, spend ? { consume: true } : undefined);
      return { appId: result.appId, alreadyConsumed: result.alreadyConsumed };
    });

  try {
    const result = await verify(token, consume);
    if (consume && result.alreadyConsumed) return { ok: false, response: refused() };
    return { ok: true, appId: result.appId };
  } catch {
    return { ok: false, response: refused() };
  }
}
