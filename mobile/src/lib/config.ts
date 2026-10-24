// FILE: mobile/src/lib/config.ts
//
// Cloud mode needs a hosted API and a Firebase project. Local mode needs
// neither: the phone learns the address by scanning a QR on the computer, and
// there is no account at all. So none of these are required to launch. Without
// them the connect screen offers local pairing only.
//
// Expo inlines EXPO_PUBLIC_* only when each is read by its full literal name,
// so they are spelled out one by one rather than looked up in a loop.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "") || null;
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || null;
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || null;
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || null;
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || null;

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

export const config = {
  apiUrl: cloudApiUrl,
  firebase,
  isCloudConfigured,
};
