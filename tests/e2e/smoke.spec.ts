// FILE: tests/e2e/smoke.spec.ts
/// <reference lib="dom" />
//
// The web smoke flows from docs/PLATFORM.md (test matrix, "Web"), run at
// 375, 768 and 1280 px (the Playwright projects).
import type { BrowserContext, Page } from "@playwright/test";
import { PASSWORD, expect, playRound, test, uniqueEmail, watchConsole } from "./support/fixtures.ts";

const STUB_CHECKOUT = "https://checkout.stripe.com/c/pay/cs_test_e2e_stub";

/** The tongue and lip outlines currently drawn in the first mouth map on the page. */
async function mouthMapShape(page: Page, scope = "figure svg") {
  return page.locator(scope).first().evaluate((svg) => Array.from(svg.querySelectorAll("path"), (p) => p.getAttribute("d")).join("|"));
}

/** Samples the drawing for a while and returns how many different frames it saw. */
async function distinctFrames(page: Page, scope?: string, samples = 12, everyMs = 80) {
  const seen = new Set<string>();
  for (let i = 0; i < samples; i++) {
    seen.add(await mouthMapShape(page, scope));
    await page.waitForTimeout(everyMs);
  }
  return seen.size;
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
}

async function signedInContext(context: BrowserContext, browserPage: Page, tag: string) {
  const email = uniqueEmail(tag);
  await signUp(browserPage, email);
  return { context, email };
}

test("landing", async ({ page, checkPage }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Advanced English, out loud." })).toBeVisible();
  // The still frame is server-rendered, then the animated demo takes over.
  await expect(page.getByRole("tablist", { name: "Sounds" })).toBeVisible({ timeout: 5_000 });
  await checkPage("landing");
});

test("local mode with no account", async ({ page, checkPage }) => {
  await page.goto("/setup");
  await checkPage("setup");
  await page.getByRole("radio", { name: /Use Cadence locally/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await checkPage("dashboard-local");
  // Practice needs no account either.
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "What do you want to practise?" })).toBeVisible();
  await checkPage("practice-local");
});

test("sign up and sign in", async ({ page, browser, checkPage, consoleErrors }) => {
  const email = uniqueEmail("signup");
  await page.goto("/signup");
  await checkPage("signup");
  await signUp(page, email);
  await checkPage("onboarding");

  // A fresh browser with no saved session signs in with the same account.
  const fresh = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  const second = await fresh.newPage();
  watchConsole(second, consoleErrors);
  await second.goto("/login");
  await checkPage("login", second);
  await second.getByRole("textbox", { name: "Email" }).fill(email);
  await second.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await second.getByRole("button", { name: "Sign in", exact: true }).click();
  await second.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
  await second.goto("/dashboard");
  await expect(second).toHaveURL(/\/dashboard/);
  await checkPage("dashboard-cloud", second);

  // A wrong password is refused.
  const third = await (await browser.newContext()).newPage();
  await third.goto("/login");
  await third.getByRole("textbox", { name: "Email" }).fill(email);
  await third.getByRole("textbox", { name: "Password" }).fill(`${PASSWORD}-wrong`);
  await third.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(third.getByRole("alert")).toBeVisible();
  await expect(third).toHaveURL(/\/login/);
  await fresh.close();
});

test("a grammar lesson and its practice", async ({ page, checkPage }) => {
  await page.goto("/grammar");
  await checkPage("grammar");
  // The browser opens at the learner's level (B2 by default); this point is B1.
  await page.getByRole("radio", { name: "B1", exact: true }).check();
  await page.getByRole("link", { name: /As \.\.\. as/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "As ... as" })).toBeVisible();
  await checkPage("grammar-lesson");
  await page.getByRole("link", { name: "Sentences", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/sentences\?.*gp=gp\.as-as-comparisons/);
  await checkPage("lesson-practice");
  await playRound(page);
  await checkPage("lesson-done");
});

test("a quiz", async ({ page, checkPage }) => {
  await page.goto("/practice/quiz?level=B1");
  await expect(page.getByRole("heading", { level: 1, name: "Quiz" })).toBeVisible();
  await checkPage("quiz");
  await playRound(page);
  await expect(page.getByText(/\d+%/).first()).toBeVisible();
  await checkPage("quiz-done");
});

test("flashcards", async ({ page, checkPage }) => {
  await page.goto("/practice/flashcards?level=B1");
  await expect(page.getByText(/Card 1 of \d+/)).toBeVisible();
  await checkPage("flashcards");
  await page.getByRole("button", { name: "Show answer" }).click();
  await checkPage("flashcards-answer");
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByText(/Card 2 of \d+/)).toBeVisible();
  // Finish the deck.
  for (let i = 0; i < 40 && !(await page.getByText("Deck done for today").isVisible()); i++) {
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: "Easy" }).click();
  }
  await expect(page.getByText("Deck done for today")).toBeVisible();
  await checkPage("flashcards-done");
});

test("checkout redirects to Stripe (stubbed)", async ({ page, context, checkPage }) => {
  await signedInContext(context, page, "checkout");
  let checkoutBody: unknown = null;
  await page.route("**/api/billing/checkout", async (route) => {
    checkoutBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: STUB_CHECKOUT }) });
  });
  await context.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html lang=en><title>Stub checkout</title><main><h1>Stub checkout</h1></main></html>" }),
  );
  await page.goto("/pricing");
  await checkPage("pricing-signed-in");
  await page.getByRole("button", { name: "Get Plus monthly" }).click();
  await page.waitForURL(STUB_CHECKOUT);
  expect(checkoutBody).toEqual({ interval: "monthly" });
});

test("mouth map animates", async ({ page, checkPage }) => {
  await page.goto("/sounds");
  await checkPage("sounds");

  // A steady consonant: the page shows its shape and labels.
  await page.goto("/sounds/sound.th");
  await expect(page.getByRole("heading", { level: 1, name: /θ/ })).toBeVisible();
  await checkPage("sound-th");

  // A diphthong is a trajectory: Play moves the tongue through it.
  await page.goto("/sounds/sound.ay");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^Play/ }).click();
  expect(await distinctFrames(page)).toBeGreaterThan(2);
  await checkPage("sound-ay");

  // The compare view morphs from one sound of a minimal pair into the other.
  await page.goto("/sounds/compare?a=sound.th&b=sound.s&words=think,sink");
  await checkPage("sounds-compare");
  await page.getByRole("button", { name: /^Morph to/ }).click();
  expect(await distinctFrames(page, 'svg[role="img"]:has(title:text-matches("^Moving from"))')).toBeGreaterThan(2);
});
