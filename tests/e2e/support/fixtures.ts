// FILE: tests/e2e/support/fixtures.ts
/// <reference lib="dom" />
//
// What every smoke test checks on every page it visits, at each width:
// no horizontal scroll, no serious or critical axe violation, no console
// error, and a full-page screenshot under build/test-screenshots/web/<width>/.
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

export const BREVO_STUB_URL = `http://127.0.0.1:${process.env.BREVO_STUB_PORT ?? 3399}`;

export interface PageReport {
  name: string;
  scrollWidth: number;
  viewport: number;
  axe: { id: string; impact: string | null | undefined; nodes: number; targets: string[] }[];
}

interface Fixtures {
  /** Runs the per-page checks and saves a screenshot named `name`. */
  checkPage: (name: string, page?: Page) => Promise<PageReport>;
  /** Console errors and uncaught exceptions seen so far, on every page of the test. */
  consoleErrors: string[];
}

// Messages that are not the page's fault: the browser's own logging of a
// deliberate 4xx the test provoked.
const IGNORED_CONSOLE = [/Failed to load resource: the server responded with a status of 4\d\d/];

export function watchConsole(page: Page, sink: string[]) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    sink.push(`${page.url()}: ${text}`);
  });
  page.on("pageerror", (error) => sink.push(`${page.url()}: uncaught ${error.message}`));
}

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    watchConsole(page, errors);
    await provide(errors);
    expect(errors, "console errors").toEqual([]);
  },
  checkPage: async ({ page: defaultPage, consoleErrors }, provide, testInfo) => {
    void consoleErrors;
    await provide(async (name, page = defaultPage) => {
      await page.waitForLoadState("load");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // After a client-side navigation the new page's title is streamed in a
      // moment after its content; axe would otherwise report it missing.
      await expect(page, `${name}: document title`).toHaveTitle(/\S/);
      const { scrollWidth, viewport } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(scrollWidth, `${name}: horizontal scroll at ${viewport}px`).toBeLessThanOrEqual(viewport + 1);

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const axe = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
      expect(axe, `${name}: serious or critical accessibility violations`).toEqual([]);

      await page.screenshot({ path: `build/test-screenshots/web/${testInfo.project.name}/${name}.png`, fullPage: true });
      const report = { name, scrollWidth, viewport, axe };
      testInfo.annotations.push({ type: "page", description: JSON.stringify(report) });
      return report;
    });
  },
});

export { expect };

/** Answers whatever the current exercise asks (first option, or any text) and checks it. */
export async function answerCurrentExercise(page: Page) {
  const card = page.locator("article").first();
  const radios = card.getByRole("radio");
  const boxes = card.getByRole("textbox");
  if ((await radios.count()) > 0) {
    await radios.first().check({ force: true });
  } else if ((await boxes.count()) > 0) {
    for (const box of await boxes.all()) await box.fill("test");
  } else {
    // Sentence building and matching: tap every tile once.
    const tiles = card.getByRole("button").filter({ hasNotText: /^(Check|Next|See results|Hear|Undo|Clear)/ });
    for (const tile of await tiles.all()) if (await tile.isEnabled()) await tile.click();
  }
  await card.getByRole("button", { name: "Check" }).click();
}

/** Plays a whole round: answer, then Next, until the round is done. */
export async function playRound(page: Page, maxSteps = 30) {
  for (let step = 0; step < maxSteps; step++) {
    if (await page.getByText("Round done").isVisible()) return;
    const results = page.getByRole("button", { name: "See results" });
    if (await results.isVisible()) {
      await results.click();
      continue;
    }
    await answerCurrentExercise(page);
    const next = page.getByRole("button", { name: /^(Next|See results)$/ });
    await expect(next).toBeVisible();
    await next.click();
  }
  await expect(page.getByText("Round done")).toBeVisible();
}

export const PASSWORD = "Practise-out-loud-42";

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
