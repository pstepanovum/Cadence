// FILE: mobile/src/lib/firebase.ts
//
// Firebase Auth for Cadence Cloud. A build made for local pairing only has no
// Firebase project, and importing this module must not bring the app down for
// someone who is only ever going to pair with their own computer, so the SDK is
// initialised lazily and only when the build carries the config.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from "firebase/auth";

import { config } from "@/lib/config";

let cached: Auth | null = null;

/**
 * The app's Auth instance, or null in a build without cloud config. The SDK
 * keeps the signed-in user in AsyncStorage and refreshes the ID token itself
 * inside `getIdToken()`, so nothing here has to watch the app's lifecycle.
 */
export function getFirebaseAuth(): Auth | null {
  if (cached) return cached;

  const firebase = config.firebase;
  if (!firebase) return null;

  if (getApps().length > 0) {
    // Fast refresh re-evaluates this module while the SDK keeps its own
    // registry, and initializeAuth throws if it runs twice for one app.
    cached = getAuth(getApp());
    return cached;
  }

  const app = initializeApp(firebase);
  cached = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  return cached;
}

/** Like getFirebaseAuth, for the screens that only exist in cloud mode. */
export function requireFirebaseAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      "Cadence Cloud is not set up in this build. Connect to a computer instead.",
    );
  }
  return auth;
}
