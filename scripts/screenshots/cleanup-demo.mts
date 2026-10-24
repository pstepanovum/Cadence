// FILE: scripts/screenshots/cleanup-demo.mts
//
// Removes what stage-demo.mts wrote: both demo accounts, their users/{uid}
// trees and usage. Emulators only; touches nothing else.
//
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_PROJECT_ID=demo-cadence node --import ./tests/register.mjs scripts/screenshots/cleanup-demo.mts
import { auth, db } from "../../src/lib/server/firebase.ts";
import { DEMO, assertEmulator } from "./demo-accounts.mts";

assertEmulator();

for (const { email } of [DEMO.plus, DEMO.free]) {
  const user = await auth().getUserByEmail(email).catch(() => null);
  if (!user) continue;
  await db().recursiveDelete(db().collection("users").doc(user.uid));
  await db().recursiveDelete(db().collection("usage").doc(user.uid));
  await auth().deleteUser(user.uid);
  console.log(`removed ${email}`);
}
