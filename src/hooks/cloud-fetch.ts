// FILE: src/hooks/cloud-fetch.ts
//
// One fetch for the web's calls to Cadence's own cloud routes (newsletter,
// sync, billing, account). It adds what those routes check:
//
//   - X-Firebase-AppCheck: an App Check token (reCAPTCHA Enterprise on the
//     web, the debug provider in development). `appCheck: "limited"` asks for
//     a limited-use token, which the server consumes once (sign-up and the
//     newsletter use replay protection).
//   - Authorization: Bearer <Firebase ID token> when someone is signed in, so
//     the desktop app, which has no session cookie, is recognised too.
//
// Without a Firebase config (local mode) neither header can exist and the
// request goes out without them; the server decides what that means.
"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getLimitedUseToken,
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { firebaseWebConfig, isFirebaseConfigured } from "@/lib/firebase/config";

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY ?? "";
const DEBUG_TOKEN = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN ?? "";

let appCheck: AppCheck | null | undefined;

function firebaseApp() {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
}

function getAppCheck(): AppCheck | null {
  if (appCheck !== undefined) return appCheck;
  appCheck = null;
  if (typeof window === "undefined" || !isFirebaseConfigured) return appCheck;

  const useDebug = process.env.NODE_ENV !== "production" || DEBUG_TOKEN !== "";
  if (useDebug) {
    // The SDK reads this global before creating its provider. `true` makes it
    // print a fresh debug token to the console for registering in Firebase.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      DEBUG_TOKEN || true;
  }
  if (!SITE_KEY && !useDebug) return appCheck;

  try {
    appCheck = initializeAppCheck(firebaseApp(), {
      provider: new ReCaptchaEnterpriseProvider(SITE_KEY || "debug"),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    appCheck = null;
  }
  return appCheck;
}

async function appCheckToken(kind: "standard" | "limited"): Promise<string | null> {
  const instance = getAppCheck();
  if (!instance) return null;
  try {
    const result = kind === "limited" ? await getLimitedUseToken(instance) : await getToken(instance);
    return result.token;
  } catch {
    return null;
  }
}

async function idToken(): Promise<string | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const auth = getAuth(firebaseApp());
    await auth.authStateReady();
    return auth.currentUser ? await auth.currentUser.getIdToken() : null;
  } catch {
    return null;
  }
}

export interface CloudFetchInit extends RequestInit {
  /** Which App Check token to attach. Default "standard". */
  appCheck?: "standard" | "limited" | false;
  /** Attach the signed-in user's ID token. Default true. */
  auth?: boolean;
  /** JSON body; sets Content-Type. */
  json?: unknown;
  /**
   * An AI request: a refusal from the routing gate (needs Plus, daily limit,
   * paused, sign in) is announced with AI_BLOCKED_EVENT so the page can offer
   * "Connect your own Cadence" or Plus instead of showing an error.
   */
  ai?: boolean;
}

export const AI_BLOCKED_EVENT = "cadence:ai-blocked";
const BLOCK_REASONS = new Set(["needs_sign_in", "needs_plus", "daily_limit", "cloud_paused", "cloud_unavailable"]);

export interface AiBlockedDetail {
  reason: string;
  message: string;
  offers: string[];
}

export async function cloudFetch(path: string, init: CloudFetchInit = {}): Promise<Response> {
  const { appCheck: appCheckKind = "standard", auth = true, json, headers, ai = false, ...rest } = init;
  const outgoing = new Headers(headers);
  const [checkToken, bearer] = await Promise.all([
    appCheckKind ? appCheckToken(appCheckKind) : Promise.resolve(null),
    auth ? idToken() : Promise.resolve(null),
  ]);
  if (checkToken) outgoing.set("X-Firebase-AppCheck", checkToken);
  if (bearer && !outgoing.has("Authorization")) outgoing.set("Authorization", `Bearer ${bearer}`);
  let body = rest.body;
  if (json !== undefined) {
    outgoing.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...rest, headers: outgoing, body });
  if (ai && !response.ok && typeof window !== "undefined") {
    const payload = (await response.clone().json().catch(() => null)) as { error?: unknown; message?: unknown; offers?: unknown } | null;
    if (typeof payload?.error === "string" && BLOCK_REASONS.has(payload.error)) {
      const detail: AiBlockedDetail = {
        reason: payload.error,
        message: typeof payload.message === "string" ? payload.message : "",
        offers: Array.isArray(payload.offers) ? payload.offers.filter((o): o is string => typeof o === "string") : [],
      };
      window.dispatchEvent(new CustomEvent<AiBlockedDetail>(AI_BLOCKED_EVENT, { detail }));
    }
  }
  return response;
}

/** The `error` code a Cadence route answered with, if any. */
export async function readErrorCode(response: Response): Promise<{ code: string | null; message: string | null; retryAfterSeconds: number | null }> {
  const body = (await response.clone().json().catch(() => null)) as
    | { error?: unknown; code?: unknown; message?: unknown; retryAfterSeconds?: unknown }
    | null;
  const code = typeof body?.error === "string" ? body.error : typeof body?.code === "string" ? body.code : null;
  const message = typeof body?.message === "string" ? body.message : null;
  const header = Number(response.headers.get("Retry-After"));
  const retryAfterSeconds =
    typeof body?.retryAfterSeconds === "number" ? body.retryAfterSeconds : Number.isFinite(header) && header > 0 ? header : null;
  return { code, message, retryAfterSeconds };
}

/** The sentence to show for a failed AI response: the server's message, else its code, else the fallback. */
export function aiErrorText(payload: unknown, fallback: string): string {
  const p = payload as { message?: unknown; error?: unknown } | null | undefined;
  if (p && typeof p.message === "string" && p.message) return p.message;
  if (p && typeof p.error === "string" && p.error && !/^[a-z_]+$/.test(p.error)) return p.error;
  return fallback;
}
