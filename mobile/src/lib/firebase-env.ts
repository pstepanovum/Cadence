// FILE: mobile/src/lib/firebase-env.ts
//
// Which Firebase Auth a build talks to, decided from its baked-in values, and
// the check that keeps a test build from ever reaching the App Store.
//
// The local Auth emulator is only for trying the cloud flows on a simulator.
// A build that points at it signs in to nothing outside this Mac, so on any
// other phone sign-up fails with a network error. That is how a test build
// left on a simulator looked like "Cadence can't create accounts". So:
//
// - The app connects to an emulator only when the build's Firebase project is
//   a `demo-` project, which no real Firebase backend accepts. A build with a
//   real project ignores an emulator address altogether, debug or release.
// - `scripts/ios-release.mjs` refuses to archive with any test value set
//   (`releaseEnvProblems`) and checks the archived bundle afterwards
//   (`bundleProblems`).
//
// Pure, no React Native imports, so the release script and the unit tests
// (tests/firebase-env.test.ts) run it under plain Node.

/** What a build's `EXPO_PUBLIC_*` values say about where sign-in goes. */
export interface AuthTarget {
  /** `host:port` of the Auth emulator, or null for the real service. */
  emulator: string | null;
  /** True for a `demo-` project: a test build that only works with the emulators on this Mac. */
  testBuild: boolean;
}

export function isDemoProject(projectId: string | null | undefined): boolean {
  return typeof projectId === "string" && projectId.trim().startsWith("demo-");
}

/**
 * Where Auth goes. The emulator is used only by a `demo-` project; a real
 * project never connects to one, whatever else the build carries.
 */
export function authTarget(projectId: string | null | undefined, emulator: string | null | undefined): AuthTarget {
  const testBuild = isDemoProject(projectId);
  const host = emulator?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
  return { emulator: testBuild ? host : null, testBuild };
}

/** Every one of these must be set for the app to offer Cadence Cloud (src/lib/config.ts). */
export const CLOUD_VALUES = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)(:\d+)?$/i;
const PRIVATE = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)(:\d+)?$/i;

function hostOf(url: string): string | null {
  const match = /^[a-z]+:\/\/([^/?#]+)/i.exec(url.trim());
  return match ? match[1] : null;
}

/**
 * Why these values cannot go into a store build, one line each; empty when
 * they can. `env` is the environment Expo bundles with (process.env plus the
 * .env files).
 */
export function releaseEnvProblems(env: Readonly<Record<string, string | undefined>>): string[] {
  const value = (name: string) => env[name]?.trim() || "";
  const problems: string[] = [];

  // Without all five, the app hides Cadence Cloud and nobody can make an
  // account: an archive made without them could not sign anyone up. A
  // deliberate pairing-only build says so with CADENCE_LOCAL_ONLY_BUILD=1.
  const missing = CLOUD_VALUES.filter((name) => !value(name));
  if (missing.length === CLOUD_VALUES.length) {
    if (value("CADENCE_LOCAL_ONLY_BUILD") !== "1") {
      problems.push("None of the Cadence Cloud values is set, so the build could not sign up or sign in. Load them (see .env.example), or set CADENCE_LOCAL_ONLY_BUILD=1 for a pairing-only build.");
    }
  } else if (missing.length > 0) {
    problems.push(`Cadence Cloud is half set up: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing, so the build would hide sign-up.`);
  }

  if (value("EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR")) {
    problems.push("EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR is set: the build would sign in to a local emulator.");
  }
  if (isDemoProject(value("EXPO_PUBLIC_FIREBASE_PROJECT_ID"))) {
    problems.push(`EXPO_PUBLIC_FIREBASE_PROJECT_ID is ${value("EXPO_PUBLIC_FIREBASE_PROJECT_ID")}, a test project no real backend accepts.`);
  }
  if (value("EXPO_PUBLIC_PURCHASES_STUB") && value("EXPO_PUBLIC_PURCHASES_STUB") !== "0") {
    problems.push("EXPO_PUBLIC_PURCHASES_STUB is set: purchases would be faked.");
  }
  const api = value("EXPO_PUBLIC_API_URL");
  if (api) {
    const host = hostOf(api);
    if (!host) problems.push(`EXPO_PUBLIC_API_URL (${api}) is not a URL.`);
    else if (LOOPBACK.test(host) || PRIVATE.test(host)) problems.push(`EXPO_PUBLIC_API_URL points at ${host}, which only this Mac or this Wi-Fi can reach.`);
    else if (!/^https:\/\//i.test(api)) problems.push(`EXPO_PUBLIC_API_URL (${api}) is not https.`);
  }
  if (value("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID") && !/\.apps\.googleusercontent\.com$/.test(value("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"))) {
    problems.push("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID does not look like an iOS OAuth client id (…apps.googleusercontent.com).");
  }
  return problems;
}

/**
 * Test values found in an archived JS bundle, and the Firebase project
 * missing from it. Expo inlines `EXPO_PUBLIC_*` when Metro transforms a file
 * and Metro's cache can keep an older build's values, so the bundle itself is
 * checked, not only the environment.
 */
export function bundleProblems(bundle: string, expected: { projectId?: string | null } = {}): string[] {
  const problems: string[] = [];
  const projectId = expected.projectId?.trim();
  if (projectId && !bundle.includes(projectId)) {
    problems.push(`the bundle does not contain the Firebase project ${projectId}, so the app would hide sign-up (Metro may have reused an older build).`);
  }
  const emulator = /(?:localhost|127\.0\.0\.1|10\.0\.2\.2):9099/.exec(bundle);
  if (emulator) problems.push(`the bundle contains the Auth emulator address ${emulator[0]}.`);
  const demo = /\bdemo-[a-z0-9-]+\.firebaseapp\.com\b/.exec(bundle);
  if (demo) problems.push(`the bundle contains the test Firebase project ${demo[0]}.`);
  return problems;
}
