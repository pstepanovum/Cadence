// FILE: playwright.config.ts
//
// Web smoke tests (docs/PLATFORM.md, test matrix "Web"). Run inside the
// emulators so sign-up works without a real Firebase project:
//
//   firebase emulators:exec --only auth,firestore --project demo-cadence "pnpm test:e2e"
//
// It builds the app with demo Firebase values (E2E_REUSE_BUILD=1 skips the
// build), starts `next start`, and a Brevo stub that records what the server
// would have sent. Stripe Checkout is stubbed in the browser by route
// interception. Every page runs at 375, 768 and 1280 px; screenshots go to
// build/test-screenshots/web/<width>/ (not committed).
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3310);
const BREVO_STUB_PORT = Number(process.env.BREVO_STUB_PORT ?? 3399);
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

const BASE_URL = `http://127.0.0.1:${PORT}`;
const BREVO_STUB_URL = `http://127.0.0.1:${BREVO_STUB_PORT}`;

// Everything the server and the build need, set explicitly so nothing from a
// developer's .env.local (real Stripe, Brevo or Gemini keys) is ever used.
const appEnv: Record<string, string> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-cadence.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-cadence",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
  NEXT_PUBLIC_APP_URL: BASE_URL,
  NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: "",
  NEXT_PUBLIC_APPLE_WEB_SIGNIN: "1",
  NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN: "",
  FIREBASE_PROJECT_ID: "demo-cadence",
  GCLOUD_PROJECT: "demo-cadence",
  FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR,
  FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
  FIREBASE_SERVICE_ACCOUNT: "",
  CADENCE_DEPLOYMENT: "",
  BREVO_API_KEY: "e2e-stub-key",
  BREVO_API_URL: `${BREVO_STUB_URL}/v3`,
  BREVO_DOI_TEMPLATE_ID: "1",
  EMAIL_DRY_RUN: "",
  EMAIL_UNSUBSCRIBE_SECRET: "e2e-unsubscribe-secret-not-for-production-0000",
  STRIPE_SECRET_KEY: "sk_test_e2e_stub_never_called",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_stub",
  REVENUECAT_WEBHOOK_SECRET: "e2e-stub",
  GEMINI_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
};

const reuseBuild = process.env.E2E_REUSE_BUILD === "1";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "build/test-results/web",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    colorScheme: "light",
  },
  projects: [
    { name: "375", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: "node tests/e2e/support/brevo-stub.mjs",
      url: `${BREVO_STUB_URL}/health`,
      env: { BREVO_STUB_PORT: String(BREVO_STUB_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `${reuseBuild ? "" : "pnpm build && "}pnpm start -H 127.0.0.1 -p ${PORT}`,
      url: `${BASE_URL}/api/version`,
      env: appEnv,
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
