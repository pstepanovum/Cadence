// FILE: tests/rules/firestore.test.ts
//
// firestore.rules and storage.rules refuse every client, signed in or not, on
// every collection Cadence uses (docs/PLATFORM.md section 5). Run with the
// emulators:
//
//   firebase emulators:exec --only firestore,storage --project demo-cadence "node --test tests/rules/firestore.test.ts"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { ref, getBytes, uploadString } from "firebase/storage";

const skip = process.env.FIRESTORE_EMULATOR_HOST ? false : "needs the Firestore emulator (firebase emulators:exec)";

const PATHS = [
  "users/u1",
  "users/u1/progress/summary",
  "users/u1/inbox/flashcards",
  "users/u1/srs/core-b1",
  "users/u1/mastery/sounds",
  "users/u1/mastery/grammar",
  "users/u1/attempts/2026-10-24",
  "users/u1/coachSessions/s1",
  "users/u1/devices/install1",
  "users/u1/moduleProgress/1",
  "users/u1/lessonSessions/x",
  "users/u1/lessonAttempts/x",
  "users/u1/conversationProgress/x",
  "usage/u1/days/2026-10-24",
  "system/aiBudget/days/2026-10-24",
  "webhookEvents/stripe:evt_1",
  "mailQueue/k1",
  "deletions/u1",
  "oauthClients/c1",
  "oauthCodes/c1",
  "oauthTokens/t1",
  "oauthGrants/g1",
  "rateLimits/r1",
  "supportRequests/s1",
  "friendCodes/c1",
  "friendCodes/c1/redemptions/u1",
];

describe("security rules deny every client", { skip }, () => {
  let env: RulesTestEnvironment;

  before(async () => {
    const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    env = await initializeTestEnvironment({
      projectId: "demo-cadence",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: fsHost, port: Number(fsPort) },
      ...(storageHost ? { storage: { rules: readFileSync("storage.rules", "utf8"), host: storageHost.split(":")[0], port: Number(storageHost.split(":")[1]) } } : {}),
    });
  });

  after(async () => {
    await env?.cleanup();
  });

  for (const path of PATHS) {
    it(`${path}: no read or write, signed out or as the owner`, async () => {
      for (const context of [env.unauthenticatedContext(), env.authenticatedContext("u1"), env.authenticatedContext("u1", { admin: true })]) {
        const firestore = context.firestore();
        await assertFails(getDoc(doc(firestore, path)));
        await assertFails(setDoc(doc(firestore, path), { plus: { active: true } }));
      }
    });
  }

  it("no collection can be listed", async () => {
    await assertFails(getDocs(collection(env.authenticatedContext("u1").firestore(), "users")));
  });

  it("storage refuses reads and writes", { skip: process.env.FIREBASE_STORAGE_EMULATOR_HOST ? false : "storage emulator not running" }, async () => {
    const storage = env.authenticatedContext("u1").storage();
    await assertFails(uploadString(ref(storage, "tts/x.mp3"), "x"));
    await assertFails(getBytes(ref(storage, "tts/x.mp3")));
    assert.ok(true);
  });
});
