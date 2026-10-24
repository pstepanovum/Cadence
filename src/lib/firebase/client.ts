// FILE: src/lib/firebase/client.ts
//
// The browser's Firebase Auth instance. The server never trusts it directly:
// after sign-in the ID token is traded for an httpOnly session cookie at
// POST /api/auth/session. Auth state is still kept in the browser (IndexedDB)
// because the desktop billing proxy needs a fresh ID token as a Bearer header.
"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth, type User } from "firebase/auth";
import { firebaseWebConfig, isFirebaseConfigured } from "@/lib/firebase/config";

export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Cadence Cloud is not configured in this build. Add the NEXT_PUBLIC_FIREBASE_* values to .env.local.",
    );
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
  return getAuth(app);
}

/** Trade the signed-in user's ID token for the server's session cookie. */
export async function startServerSession(user: User) {
  const idToken = await user.getIdToken();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not start your session. Please try again.");
  }
}

/** The current user's ID token, waiting for Firebase to restore a saved session. */
export async function getCurrentIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
