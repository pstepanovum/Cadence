// FILE: tests/e2e/newsletter.spec.ts
//
// The newsletter against the Brevo stub: signing up starts Brevo's double
// opt-in (one doubleOptinConfirmation request for list 5) and nothing ever
// adds the address to list 5 directly; an account created without ticking
// the box asks for no newsletter at all.
import { expect, test, uniqueEmail, BREVO_STUB_URL, PASSWORD } from "./support/fixtures.ts";

interface StubRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  apiKeyPresent: boolean;
}

async function brevoRequests(): Promise<StubRequest[]> {
  const response = await fetch(`${BREVO_STUB_URL}/__requests`);
  return (await response.json()) as StubRequest[];
}

function forEmail(requests: StubRequest[], email: string) {
  return requests.filter((r) => JSON.stringify(r).toLowerCase().includes(email.toLowerCase()));
}

/** Any request that would put the address on the newsletter list without the opt-in click. */
function directListFiveAdds(requests: StubRequest[]) {
  return requests.filter((r) => {
    if (r.path.endsWith("/contacts/doubleOptinConfirmation")) return false;
    if (/\/contacts\/lists\/5\/contacts\/add$/.test(r.path)) return true;
    const lists = (r.body?.listIds ?? []) as unknown[];
    return Array.isArray(lists) && lists.includes(5);
  });
}

test("footer sign-up sends a double opt-in request and nothing else", async ({ page, checkPage }, testInfo) => {
  const email = uniqueEmail(`news-${testInfo.project.name}`);
  await page.goto("/");
  // The footer sits inside <main>, so it is not a contentinfo landmark.
  const footer = page.locator("footer");
  await footer.getByRole("textbox", { name: /Product updates/ }).fill(email);
  await footer.getByRole("button", { name: "Sign up" }).click();
  await expect(footer.getByText("Check your email.")).toBeVisible();
  await checkPage("newsletter-sent");

  const mine = forEmail(await brevoRequests(), email);
  const doi = mine.filter((r) => r.method === "POST" && r.path === "/v3/contacts/doubleOptinConfirmation");
  expect(doi).toHaveLength(1);
  expect(doi[0].apiKeyPresent).toBe(true);
  expect(doi[0].body?.includeListIds).toEqual([5]);
  expect(doi[0].body?.templateId).toBe(1);
  expect(String(doi[0].body?.redirectionUrl)).toMatch(/\/api\/newsletter\/confirmed\?token=/);
  expect(directListFiveAdds(mine)).toEqual([]);
});

test("the newsletter page refuses a bad address without calling Brevo", async ({ page }, testInfo) => {
  await page.goto("/newsletter");
  // Other tests run in parallel against the same stub, so only requests that
  // mention this address count.
  const address = `not-an-email-${testInfo.project.name}-${Date.now()}`;
  const form = page.locator("main form").first();
  await form.getByRole("textbox", { name: /Product updates/ }).fill(address);
  await form.getByRole("button", { name: "Sign up" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  expect(forEmail(await brevoRequests(), address)).toEqual([]);
});

test("an account created without the newsletter box never reaches list 5", async ({ page }, testInfo) => {
  const email = uniqueEmail(`account-${testInfo.project.name}`);
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await expect(page.getByRole("checkbox", { name: /product news/i })).not.toBeChecked();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  // Give the queued welcome mail and the list-4 contact time to go out.
  await page.waitForTimeout(1_500);
  const mine = forEmail(await brevoRequests(), email);
  expect(mine.filter((r) => r.path.endsWith("/contacts/doubleOptinConfirmation"))).toEqual([]);
  expect(directListFiveAdds(mine)).toEqual([]);
});

test("ticking the box at sign-up asks for the opt-in, not a list add", async ({ page }, testInfo) => {
  const email = uniqueEmail(`optin-${testInfo.project.name}`);
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /product news/i }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  await expect.poll(async () => forEmail(await brevoRequests(), email).filter((r) => r.path.endsWith("/contacts/doubleOptinConfirmation")).length).toBe(1);
  expect(directListFiveAdds(forEmail(await brevoRequests(), email))).toEqual([]);
});
