// FILE: src/lib/server/env.ts
//
// Where this server is running and what that allows. One question decides the
// cost rules: is this the hosted Cadence cloud (cadence-web on Cloud Run), or
// someone's own Cadence (desktop, docker-compose, `pnpm dev`)?
//
//   hosted cloud   AI calls need Plus, quotas and the circuit breaker apply,
//                  App Check is enforced, local-mode sessions get no AI.
//   own Cadence    nothing is gated: the engines are the learner's own.
//
// CADENCE_DEPLOYMENT=cloud|self-hosted says which. When it is unset, a Cloud
// Run runtime (K_SERVICE) counts as the hosted cloud, so a deploy that forgets
// the variable fails closed rather than handing out free cloud AI.
//
// Pure apart from reading the environment it is given, so tests pass their own.

export type Env = Record<string, string | undefined>;

export const CANONICAL_ORIGIN = "https://cadence.pstepanov.dev";

export function isHostedCloud(env: Env = process.env): boolean {
  const declared = env.CADENCE_DEPLOYMENT?.trim().toLowerCase();
  if (declared === "cloud") return true;
  if (declared === "self-hosted") return false;
  return Boolean(env.K_SERVICE);
}

function flag(value: string | undefined): boolean | null {
  const text = value?.trim().toLowerCase();
  if (!text) return null;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return null;
}

/**
 * App Check is enforced on the hosted cloud unless APP_CHECK_ENFORCE=0 says
 * otherwise (a staging service before the apps ship the provider), and off on
 * an own Cadence, which has no App Check project to verify against.
 */
export function isAppCheckEnforced(env: Env = process.env): boolean {
  return flag(env.APP_CHECK_ENFORCE) ?? isHostedCloud(env);
}

/**
 * The public origin links in email and Checkout return URLs are built on.
 * Never the Host header: a spoofed host would put an attacker's domain in a
 * password-reset email.
 */
export function appOrigin(env: Env = process.env): string {
  const raw = env.CADENCE_PUBLIC_ORIGIN?.trim() || env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if (url.protocol === "https:" || local) return url.origin;
    } catch {
      // Fall through to the canonical origin.
    }
  }
  return CANONICAL_ORIGIN;
}

/** Firebase project id for the server. */
export function firebaseProjectId(env: Env = process.env): string | null {
  return env.FIREBASE_PROJECT_ID?.trim() || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || env.GCLOUD_PROJECT?.trim() || null;
}

export function isEmulated(env: Env = process.env): boolean {
  return Boolean(env.FIRESTORE_EMULATOR_HOST);
}
