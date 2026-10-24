// FILE: src/lib/firebase/admin.ts
//
// The Firebase Admin SDK, server side only. It bypasses Firestore security
// rules entirely, so every read and write must be scoped to the signed-in
// user's uid in code; keeping all user data under users/{uid} makes that part
// of the path.
//
// Credentials: FIREBASE_SERVICE_ACCOUNT (the service-account JSON) when set,
// otherwise Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS,
// gcloud, or the runtime's own identity on Google Cloud). Verifying ID tokens
// and session cookies needs only the project id; minting session cookies and
// reaching Firestore need credentials.
import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const APP_NAME = "cadence-server";

export function getFirebaseProjectId(): string | null {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    null
  );
}

export function isFirebaseServerConfigured() {
  return getFirebaseProjectId() !== null;
}

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    return null;
  }

  try {
    return cert(JSON.parse(raw) as Record<string, string>);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is set but is not valid service-account JSON.");
  }
}

function getAdminApp(): App {
  if (getApps().some((app) => app.name === APP_NAME)) {
    return getApp(APP_NAME);
  }

  const projectId = getFirebaseProjectId();
  if (!projectId) {
    throw new Error("Cadence Cloud is not configured: set FIREBASE_PROJECT_ID.");
  }

  const credential = readServiceAccount();
  return initializeApp(credential ? { credential, projectId } : { projectId }, APP_NAME);
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
