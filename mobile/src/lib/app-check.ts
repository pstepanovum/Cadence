// Firebase App Check for the hosted API (docs/PLATFORM.md, section 14): every
// cloud AI, sync and newsletter call carries an `X-Firebase-AppCheck` token.
//
// The Firebase JS SDK's App Check needs a browser, so the app talks to App
// Check's REST API itself:
//
// - App Attest on iOS, through the small native module in
//   modules/cadence-app-attest: a key is generated and attested once, and later
//   tokens come from assertions with that key.
// - The debug provider in development (Expo Go, the simulator, which has no
//   App Attest): EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN, a debug token registered in
//   the Firebase console. Ignored in release builds.
//
// Without a token the header is simply left off and the server answers 401;
// a paired Cadence server never asks for one.
import { requireOptionalNativeModule } from "expo";
import * as SecureStore from "expo-secure-store";

import { config } from "@/lib/config";

interface AppAttestModule {
  isSupported: boolean;
  generateKey(): Promise<string>;
  attestKey(keyId: string, parts: string[]): Promise<string>;
  generateAssertion(keyId: string, parts: string[]): Promise<string>;
}

const attest = requireOptionalNativeModule<AppAttestModule>("CadenceAppAttest");

const IOS_APP_ID = process.env.EXPO_PUBLIC_FIREBASE_IOS_APP_ID?.trim() || null;
const DEBUG_TOKEN = __DEV__ ? process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN?.trim() || null : null;
const KEY_ID = "cadence.appcheck.keyId";
const ARTIFACT = "cadence.appcheck.artifact";
/** Refresh a little before the token runs out. */
const MARGIN_MS = 5 * 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

function endpoint(method: string): string | null {
  const appId = IOS_APP_ID ?? config.firebase?.appId ?? null;
  const apiKey = config.firebase?.apiKey;
  const projectNumber = appId?.split(":")[1];
  if (!appId || !apiKey || !projectNumber) return null;
  return `https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${appId}:${method}?key=${encodeURIComponent(apiKey)}`;
}

async function post<T>(method: string, body: unknown): Promise<T> {
  const url = endpoint(method);
  if (!url) throw new Error("App Check is not configured in this build.");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`App Check refused the request (${response.status}).`);
  return (await response.json()) as T;
}

interface TokenResponse {
  token: string;
  ttl: string;
}

const ttlMs = (ttl: string) => (Number.parseFloat(ttl) || 3600) * 1000;

async function viaDebug(token: string): Promise<TokenResponse> {
  return post<TokenResponse>("exchangeDebugToken", { debug_token: token });
}

async function viaAppAttest(module: AppAttestModule): Promise<TokenResponse> {
  const { challenge } = await post<{ challenge: string }>("generateAppAttestChallenge", {});
  const keyId = await SecureStore.getItemAsync(KEY_ID);
  const artifact = await SecureStore.getItemAsync(ARTIFACT);

  if (keyId && artifact) {
    try {
      const assertion = await module.generateAssertion(keyId, [artifact, challenge]);
      return await post<TokenResponse>("exchangeAppAttestAssertion", { artifact, assertion, challenge });
    } catch {
      // The key may have been invalidated (a restore to a new device); attest a new one.
    }
  }

  const newKey = await module.generateKey();
  const attestation = await module.attestKey(newKey, [challenge]);
  const result = await post<{ artifact: string; appCheckToken: TokenResponse }>("exchangeAppAttestAttestation", {
    attestation_statement: attestation,
    challenge,
    // Firebase takes the key id's own (ASCII, base64) text as bytes.
    key_id: btoa(newKey),
  });
  await SecureStore.setItemAsync(KEY_ID, newKey);
  await SecureStore.setItemAsync(ARTIFACT, result.artifact);
  return result.appCheckToken;
}

async function fetchToken(): Promise<string | null> {
  try {
    const result = DEBUG_TOKEN ? await viaDebug(DEBUG_TOKEN) : attest?.isSupported ? await viaAppAttest(attest) : null;
    if (!result) return null;
    cached = { token: result.token, expiresAt: Date.now() + ttlMs(result.ttl) };
    return result.token;
  } catch {
    return null;
  }
}

/** A current App Check token, or null when this build or device cannot get one. */
export async function getAppCheckToken(): Promise<string | null> {
  if (cached && cached.expiresAt - MARGIN_MS > Date.now()) return cached.token;
  inflight ??= fetchToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function appCheckHeaders(): Promise<Record<string, string>> {
  const token = await getAppCheckToken();
  return token ? { "X-Firebase-AppCheck": token } : {};
}

/** Whether this build can produce App Check tokens at all, for diagnostics. */
export const appCheckAvailable = Boolean(DEBUG_TOKEN || (attest?.isSupported && endpoint("x")));
