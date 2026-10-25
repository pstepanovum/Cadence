// FILE: mobile/src/lib/config.ts
//
// Cloud mode needs a hosted API and a Firebase project. Local mode needs
// neither: the phone learns the address by scanning a QR on the computer, and
// there is no account at all. So none of these are required to launch. Without
// them the connect screen offers local pairing only.
//
// Expo inlines EXPO_PUBLIC_* only when each is read by its full literal name,
// so they are spelled out one by one rather than looked up in a loop.
import { authTarget } from "./firebase-env.ts";

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "") || null;
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || null;
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || null;
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || null;
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || null;
const authEmulator = process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR?.trim() || null;
// Google Sign-In: the iOS OAuth client (its reversed id is the app's URL
// scheme, see app.config.js) and, optionally, the project's web client, which
// becomes the ID token's audience.
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || null;
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || null;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const firebase: FirebaseConfig | null =
  apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : null;

/**
 * The hosted origin, only when the build can also sign in to it. An API URL
 * with no Firebase project behind it is not a usable cloud setup.
 */
const cloudApiUrl = apiUrl && firebase ? apiUrl : null;

/** Whether this build can offer the hosted option at all. */
export const isCloudConfigured = cloudApiUrl !== null;

/**
 * Where sign-in goes. Only a `demo-` project ever uses the Auth emulator, so a
 * build with the real project can never be pointed at one by accident.
 */
const auth = authTarget(projectId, authEmulator);

export const config = {
  apiUrl: cloudApiUrl,
  firebase,
  isCloudConfigured,
  /** `host:port` of the local Auth emulator in a test build, else null. */
  authEmulator: auth.emulator,
  /** A `demo-` project build for the simulator flows. */
  testBuild: auth.testBuild,
  google: { iosClientId: googleIosClientId, webClientId: googleWebClientId },
};
