// FILE: tests/server/emulator/helpers.ts
//
// Shared setup for the tests that run against the Firebase emulators:
//
//   firebase emulators:exec --only auth,firestore --project demo-cadence \
//     "node --test --import ./tests/register.mjs 'tests/server/**/*.test.ts'"
//
// Without FIRESTORE_EMULATOR_HOST every emulator test is skipped, so a plain
// `pnpm test` stays fast and offline.

export const EMULATED = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
export const PROJECT = process.env.GCLOUD_PROJECT || "demo-cadence";

process.env.FIREBASE_PROJECT_ID ||= PROJECT;
process.env.QUIZ_TOKEN_SECRET ||= "test-quiz-secret-that-is-long-enough-000";
process.env.EMAIL_UNSUBSCRIBE_SECRET ||= "test-unsubscribe-secret-long-enough-0000";
process.env.EMAIL_DRY_RUN = "1";
process.env.REVENUECAT_WEBHOOK_SECRET ||= "rc-test-secret";

export const skip = EMULATED ? false : "needs the Firestore and Auth emulators (firebase emulators:exec)";

export async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

export async function clearAuth(): Promise<void> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (host) await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

/** A new emulator account and a fresh ID token for it. */
export async function signUp(email = `learner${Math.random().toString(36).slice(2, 8)}@example.com`): Promise<{ uid: string; idToken: string; email: string }> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) throw new Error("FIREBASE_AUTH_EMULATOR_HOST is not set.");
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct horse battery", returnSecureToken: true }),
  });
  const body = (await response.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken, email };
}

export const DAY = 86_400_000;

export function plusRecord(source: "stripe" | "app_store", now: number, over: Record<string, unknown> = {}) {
  return { active: true, source, productId: "dev.pstepanov.cadence.plus.monthly", expiresAt: now + 30 * DAY, willRenew: true, updatedAt: now, eventAt: now, ...over };
}
