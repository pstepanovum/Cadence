// FILE: src/lib/firebase/config.ts
//
// The public Firebase web config. Each NEXT_PUBLIC_ variable is read by its
// literal name so Next.js can inline it into the browser bundle. When any of
// them is missing the cloud option stays hidden and cloud-only routes redirect
// to /setup.
export const firebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const isFirebaseConfigured = Boolean(
  firebaseWebConfig.apiKey &&
    firebaseWebConfig.authDomain &&
    firebaseWebConfig.projectId &&
    firebaseWebConfig.appId,
);
