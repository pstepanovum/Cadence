// FILE: tests/e2e/oauth-consent.spec.ts
/// <reference lib="dom" />
//
// The MCP connector's consent page end to end: discovery points at a page
// that exists, a registered client is shown where its code goes before
// anything else, Allow returns a code to the client's redirect URI, and that
// code buys an access token with the PKCE verifier. Also checks the security
// headers on the page.
import { createHash, randomBytes } from "node:crypto";
import { PASSWORD, expect, test, uniqueEmail } from "./support/fixtures.ts";

const REDIRECT = "http://127.0.0.1:65530/callback";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

test("connector consent: discover, sign in, allow, exchange", async ({ page, request, checkPage }, testInfo) => {
  test.skip(testInfo.project.name !== "375" && testInfo.project.name !== "1280", "two widths are enough for one flow");

  const metadata = await (await request.get("/.well-known/oauth-authorization-server")).json();
  const authorizePath = new URL(metadata.authorization_endpoint).pathname;
  expect(authorizePath).toBe("/oauth/authorize");
  const resource = await (await request.get("/.well-known/oauth-protected-resource/api/mcp")).json();
  expect(new URL(resource.resource_documentation).pathname).toBe("/connector");
  expect((await request.get(new URL(resource.resource_documentation).pathname)).status()).toBe(200);

  const registered = await request.post("/api/oauth/register", {
    data: { client_name: "E2E Notes", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" },
  });
  expect(registered.status()).toBe(201);
  const { client_id: clientId } = await registered.json();

  const { verifier, challenge } = pkce();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    state: "e2e-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "cadence:read cadence:write",
    resource: resource.resource,
  });

  // The client's callback is on loopback; answer it here instead of a real app.
  let callback: URL | null = null;
  await page.route(`${REDIRECT}**`, async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Connected</title><p>Connected</p>" });
  });

  const response = await page.goto(`${authorizePath}?${params}`);
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");

  // Signed out: the page signs in itself, keeping the request.
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await checkPage("oauth-sign-in");
  const email = uniqueEmail("oauth");
  // A fresh account, made through the normal sign-up page in another tab.
  const signup = await page.context().newPage();
  await signup.goto("/signup");
  await signup.getByRole("textbox", { name: "Email" }).fill(email);
  await signup.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await signup.getByRole("button", { name: "Create account" }).click();
  await signup.waitForURL(/\/onboarding/, { timeout: 30_000 });
  await signup.close();

  await page.reload();
  // The account from the other tab is already signed in on this origin.
  await expect(page.getByRole("heading", { name: "Connect an app to Cadence?" })).toBeVisible({ timeout: 15_000 });
  const destination = page.getByTestId("oauth-destination");
  await expect(destination).toContainText("127.0.0.1");
  await expect(page.getByText("E2E Notes")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /See your progress/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /See your progress/ })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /Add flashcards/ })).toBeChecked();
  await checkPage("oauth-consent");

  // Narrow the request to read only, then allow.
  await page.getByRole("checkbox", { name: /Add flashcards/ }).uncheck();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => callback?.toString() ?? "", { timeout: 15_000 }).toContain("code=");
  const returned = callback as unknown as URL;
  expect(returned.searchParams.get("state")).toBe("e2e-state");
  expect(returned.searchParams.get("iss")).toBe(new URL(metadata.issuer).origin);

  const token = await request.post("/api/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code: returned.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: resource.resource,
    },
  });
  expect(token.status()).toBe(200);
  const issued = await token.json();
  expect(issued.token_type.toLowerCase()).toBe("bearer");
  expect(issued.scope).toBe("cadence:read");

  // The same code never works twice.
  const again = await request.post("/api/oauth/token", {
    form: { grant_type: "authorization_code", code: returned.searchParams.get("code") ?? "", redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier },
  });
  expect(again.status()).toBe(400);
});

test("connector consent: deny sends access_denied back", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "1280", "one width");
  const registered = await request.post("/api/oauth/register", { data: { client_name: "E2E Deny", redirect_uris: [REDIRECT] } });
  const { client_id: clientId } = await registered.json();
  const { challenge } = pkce();
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: "code", state: "s2", code_challenge: challenge, code_challenge_method: "S256" });
  let callback: URL | null = null;
  await page.route(`${REDIRECT}**`, async (route) => {
    callback = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Back</title>" });
  });

  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Email" }).fill(uniqueEmail("oauth-deny"));
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });

  await page.goto(`/oauth/authorize?${params}`);
  await page.getByRole("button", { name: "Deny" }).click();
  await expect.poll(() => callback?.searchParams.get("error") ?? "", { timeout: 15_000 }).toBe("access_denied");

  // An unknown client is refused on Cadence's own page, never redirected.
  await page.goto(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(params), client_id: "nope" })}`);
  await expect(page.getByRole("heading", { name: "Can't connect" })).toBeVisible();
});
