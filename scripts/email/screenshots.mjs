// FILE: scripts/email/screenshots.mjs
//
// Screenshots of the rendered previews (run scripts/email/preview.ts first)
// at phone and desktop widths, light and dark, into build/email-screenshots/.
// Dark uses the real prefers-color-scheme media query, as Apple Mail does.
//
//   node scripts/email/screenshots.mjs [template ...]
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const previews = join(root, "build", "email-previews");
const out = join(root, "build", "email-screenshots");
mkdirSync(out, { recursive: true });

const wanted = process.argv.slice(2);
const ids = readdirSync(previews)
  .filter((name) => name.endsWith(".html") && !name.endsWith(".dark.html") && name !== "index.html")
  .map((name) => name.slice(0, -5))
  .filter((id) => wanted.length === 0 || wanted.includes(id));

const browser = await chromium.launch();
for (const width of [375, 600]) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: scheme, deviceScaleFactor: 2 });
    for (const id of ids) {
      await page.goto(pathToFileURL(join(previews, `${id}.html`)).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(out, `${id}-${width}-${scheme}.png`), fullPage: true });
    }
    await page.close();
  }
}
await browser.close();
console.log(`${ids.length * 4} screenshots in build/email-screenshots/`);
