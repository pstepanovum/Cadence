// FILE: tests/e2e/auth-providers.spec.ts
/// <reference lib="dom" />
//
// Sign-in with Google and Apple, the account's sign-in methods, sign-out and
// the password reset, against the Auth emulator (whose fake identity
// provider stands in for Google and Apple). Desktop widths use the popup;
// the 375 px project is a phone, which uses the full-page redirect.
import type { Page } from "@playwright/test";
import { PASSWORD, expect, test, uniqueEmail } from "./support/fixtures.ts";

const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

/**
 * Every test here signs in several times from 127.0.0.1, and the per-IP
 * sign-in limit (20 an hour) is shared by every run against these
 * emulators, so its window is emptied first. Emulator data only.
 */
async function resetSignInLimit() {
  const base = `http://${FIRESTORE_EMULATOR}/v1/projects/demo-cadence/databases/(default)/documents`;
  const headers = { Authorization: "Bearer owner" };
  const listing = (await (await fetch(`${base}/rateLimits?pageSize=300`, { headers })).json()) as { documents?: { name: string }[] };
  for (const doc of listing.documents ?? []) {
    const id = doc.name.split("/").at(-1) ?? "";
    if (id.startsWith("auth-ip-hour:")) await fetch(`${base}/rateLimits/${encodeURIComponent(id)}`, { method: "DELETE", headers });
  }
}

test.beforeEach(resetSignInLimit);

/** Picks a new fake account on the emulator's identity-provider page. */
async function fakeProviderAccount(idp: Page, email: string) {
  await idp.waitForURL(/emulator\/auth\/handler/);
  await idp.getByText("Add new account").click();
  await idp.locator("#email-input").fill(email);
  await idp.getByRole("button", { name: /Sign in with/ }).click();
}

/**
 * Clicks a provider button and completes the emulator's page: in a popup on
 * a desktop browser, in the same tab where the app prefers the redirect
 * (phones and Safari).
 */
async function continueWith(page: Page, button: RegExp, email: string) {
  const popup = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);
  await page.getByRole("button", { name: button }).click();
  await fakeProviderAccount((await popup) ?? page, email);
}

async function signOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL((url) => !/\/account/.test(url.pathname), { timeout: 20_000 });
}

test("sign up with Google, add a password and Apple, remove Google, keep the last method", async ({ page, checkPage }) => {
  const email = uniqueEmail("google");

  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Sign up with Apple" })).toBeVisible();
  await continueWith(page, /Sign up with Google/, email);
  // A new account goes to setup, as an email sign-up does.
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });

  await page.goto("/account");
  const methods = page.getByRole("heading", { name: "Sign-in methods" });
  await expect(methods).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("method-google.com")).toContainText("your only way in");
  await expect(page.getByTestId("method-google.com").getByRole("button", { name: "Remove" })).toHaveCount(0);
  await checkPage("account-sign-in-methods");

  // A password as a second way in.
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByRole("button", { name: "Add password" }).click();
  await expect(page.getByText("Password added.")).toBeVisible();
  await expect(page.getByTestId("method-password")).toContainText("Connected");

  // Apple as a third.
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("method-apple.com").getByRole("button", { name: "Add" }).click()]);
  await fakeProviderAccount(popup, email);
  await expect(page.getByTestId("method-apple.com")).toContainText("Connected", { timeout: 15_000 });

  // Google can go now that there is another way in.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("method-google.com").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Google removed.")).toBeVisible();
  await expect(page.getByTestId("method-google.com")).toContainText("Not added");

  // The password signs in to the same account.
  await signOut(page);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
});

test("sign in with Apple creates an account and signs out again", async ({ page, checkPage }) => {
  await page.goto("/login");
  await checkPage("login-providers");
  await continueWith(page, /Sign in with Apple/, uniqueEmail("apple"));
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  await signOut(page);
  // Signed out: the protected pages send you away (to sign in, or to choose
  // a mode, since signing out also forgets the cloud choice).
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/(login|setup)/);
});

test("an iPhone signs in with Google by redirect, not a popup", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "375", "one phone width is enough");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await page.goto("/signup");
  const popups: Page[] = [];
  page.on("popup", (popup) => popups.push(popup));
  await page.getByRole("button", { name: "Sign up with Google" }).click();
  await fakeProviderAccount(page, uniqueEmail("redirect"));
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  expect(popups).toHaveLength(0);
  await context.close();
});

test("forgot password sends a link that sets a new password", async ({ page, browser, checkPage }) => {
  const email = uniqueEmail("reset");
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  await signOut(page);

  await page.goto("/forgot-password");
  await checkPage("forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: /link/i })).toBeVisible({ timeout: 15_000 });

  // The emulator keeps the email's code instead of sending it.
  let oobCode: string | undefined;
  await expect
    .poll(async () => {
      const response = await fetch(`http://${AUTH_EMULATOR}/emulator/v1/projects/demo-cadence/oobCodes`);
      const body = (await response.json()) as { oobCodes: { email: string; oobCode: string; requestType: string }[] };
      oobCode = body.oobCodes.filter((code) => code.email === email && code.requestType === "PASSWORD_RESET").at(-1)?.oobCode;
      return oobCode;
    })
    .toBeTruthy();

  const fresh = `${PASSWORD}-new`;
  await page.goto(`/reset-password?mode=resetPassword&oobCode=${oobCode}`);
  await page.getByLabel("New password").fill(fresh);
  await page.getByLabel("Repeat it").fill(fresh);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible({ timeout: 15_000 });

  // The new password signs in from a browser with no session.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto("/login");
  await other.getByRole("textbox", { name: "Email" }).fill(email);
  await other.getByRole("textbox", { name: "Password" }).fill(fresh);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await other.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
  await context.close();
});
