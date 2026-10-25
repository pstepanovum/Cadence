// The guard that keeps test builds away from the App Store
// (src/lib/firebase-env.ts): only a demo- project ever signs in to the Auth
// emulator, and the release script refuses test values and checks the bundle.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authTarget, bundleProblems, releaseEnvProblems } from "../src/lib/firebase-env.ts";

const STORE_ENV = {
  EXPO_PUBLIC_API_URL: "https://cadence.pstepanov.dev",
  EXPO_PUBLIC_FIREBASE_API_KEY: "AIza-real",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "cadence-pstepanov.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "cadence-pstepanov",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "123-abc.apps.googleusercontent.com",
};

describe("authTarget", () => {
  it("connects a demo- project to the emulator", () => {
    assert.deepEqual(authTarget("demo-cadence", "127.0.0.1:9099"), { emulator: "127.0.0.1:9099", testBuild: true });
    assert.deepEqual(authTarget("demo-cadence", "http://127.0.0.1:9099/"), { emulator: "127.0.0.1:9099", testBuild: true });
  });

  it("never connects a real project to an emulator, whatever the build carries", () => {
    assert.deepEqual(authTarget("cadence-pstepanov", "127.0.0.1:9099"), { emulator: null, testBuild: false });
    assert.deepEqual(authTarget("cadence-pstepanov", null), { emulator: null, testBuild: false });
    assert.deepEqual(authTarget(null, "127.0.0.1:9099"), { emulator: null, testBuild: false });
  });

  it("marks a demo- project without an emulator as a test build", () => {
    assert.deepEqual(authTarget("demo-cadence", ""), { emulator: null, testBuild: true });
  });
});

describe("releaseEnvProblems", () => {
  it("accepts a store build's values, and an empty local-pairing build", () => {
    assert.deepEqual(releaseEnvProblems(STORE_ENV), []);
    assert.deepEqual(releaseEnvProblems({}), []);
  });

  it("refuses the e2e environment", () => {
    const problems = releaseEnvProblems({
      EXPO_PUBLIC_API_URL: "http://127.0.0.1:3000",
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: "demo-cadence",
      EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR: "127.0.0.1:9099",
      EXPO_PUBLIC_PURCHASES_STUB: "1",
    });
    assert.equal(problems.length, 4);
    assert.match(problems.join("\n"), /emulator/);
    assert.match(problems.join("\n"), /demo-cadence/);
    assert.match(problems.join("\n"), /faked/);
    assert.match(problems.join("\n"), /127\.0\.0\.1:3000/);
  });

  it("refuses an API on the LAN or without https", () => {
    assert.equal(releaseEnvProblems({ ...STORE_ENV, EXPO_PUBLIC_API_URL: "http://192.168.1.42:3000" }).length, 1);
    assert.equal(releaseEnvProblems({ ...STORE_ENV, EXPO_PUBLIC_API_URL: "http://mac.local:3000" }).length, 1);
    assert.match(releaseEnvProblems({ ...STORE_ENV, EXPO_PUBLIC_API_URL: "http://cadence.pstepanov.dev" })[0], /https/);
  });

  it("refuses an emulator address even with the real project", () => {
    assert.equal(releaseEnvProblems({ ...STORE_ENV, EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR: "127.0.0.1:9099" }).length, 1);
  });

  it("checks the Google client id's shape", () => {
    assert.equal(releaseEnvProblems({ ...STORE_ENV, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: "not-a-client" }).length, 1);
  });
});

describe("bundleProblems", () => {
  it("finds an inlined emulator address or test project", () => {
    assert.equal(bundleProblems('connect("http://127.0.0.1:9099")').length, 1);
    assert.equal(bundleProblems('authDomain:"demo-cadence.firebaseapp.com"').length, 1);
  });

  it("passes a clean bundle that only mentions the rule", () => {
    assert.deepEqual(bundleProblems('projectId.startsWith("demo-") && "cadence-pstepanov.firebaseapp.com"'), []);
  });
});
