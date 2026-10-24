// FILE: src/lib/server/firebase.ts
//
// The Admin SDK for the server modules under src/lib/server, src/lib/oauth and
// src/lib/mcp. It shares the one named app with src/lib/firebase/admin.ts (same
// name, same options), so both see the same Firestore client. Kept free of
// `server-only` and path aliases so the emulator tests can import it directly.
//
// The Admin SDK bypasses security rules: every function that touches user
// data takes the uid of an already verified identity, never one from a body.
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { firebaseProjectId } from "./env";

const APP_NAME = "cadence-server";

function adminApp(): App {
  if (getApps().some((app) => app.name === APP_NAME)) return getApp(APP_NAME);

  const projectId = firebaseProjectId();
  if (!projectId) throw new Error("Cadence Cloud is not configured: set FIREBASE_PROJECT_ID.");

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(raw) as Record<string, string>;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is set but is not valid service-account JSON.");
    }
    return initializeApp({ credential: cert(parsed), projectId }, APP_NAME);
  }
  return initializeApp({ projectId }, APP_NAME);
}

export function db(): Firestore {
  return getFirestore(adminApp());
}

export function auth(): Auth {
  return getAuth(adminApp());
}

export function adminAppInstance(): App {
  return adminApp();
}

/** Firestore's ALREADY_EXISTS, thrown by create() on an existing document. */
export function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}
