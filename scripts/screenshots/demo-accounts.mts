// FILE: scripts/screenshots/demo-accounts.mts
//
// The two screenshot accounts. They exist only in the local emulators, so
// their passwords are not secrets.
export const DEMO = {
  plus: { email: "sam@demo.cadence.test", password: process.env.SCREENSHOT_DEMO_PASSWORD ?? "practise2026" },
  free: { email: "alex@demo.cadence.test", password: process.env.SCREENSHOT_DEMO_PASSWORD ?? "practise2026" },
};

/** Refuses anything but the emulators with a demo- project id. */
export function assertEmulator() {
  const project = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? "";
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !project.startsWith("demo-")) {
    throw new Error("Run against the emulators only: set FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST and a demo- FIREBASE_PROJECT_ID.");
  }
}
