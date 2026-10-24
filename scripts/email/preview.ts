// FILE: scripts/email/preview.ts
//
// Renders every email template from its fixture into build/email-previews/:
// <id>.html, <id>.txt, and an index.html linking them all, with a light and a
// forced-dark view of each. Sends nothing.
//
//   node --import ./tests/register.mjs scripts/email/preview.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DARK_MEDIA, EMAIL_ASSET_ORIGIN } from "../../src/lib/server/email/layout.ts";
import { TEMPLATES, TEMPLATE_IDS, renderFixture } from "../../src/lib/server/email/templates/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "build", "email-previews");
mkdirSync(out, { recursive: true });

const rows: string[] = [];
for (const id of TEMPLATE_IDS) {
  const email = renderFixture(id);
  // The logo is served from the site once deployed; previews point at the
  // local copy in public/email so they show it before then.
  const html = email.html.split(EMAIL_ASSET_ORIGIN).join(`file://${join(root, "public", "email")}/`);
  writeFileSync(join(out, `${id}.html`), html);
  // The dark palette applied unconditionally, to check it in any browser.
  writeFileSync(join(out, `${id}.dark.html`), html.replace(DARK_MEDIA, "@media all"));
  writeFileSync(join(out, `${id}.txt`), `Subject: ${email.subject}\nPreheader: ${email.preheader}\n\n${email.text}`);
  const entry = TEMPLATES[id];
  rows.push(
    `<tr><td>${entry.group}</td><td>${entry.name}</td><td>${email.category}</td><td>${email.subject.replace(/</g, "&lt;")}</td><td><a href="${id}.html">light</a> · <a href="${id}.dark.html">dark</a> · <a href="${id}.txt">text</a></td><td>${(Buffer.byteLength(email.html) / 1024).toFixed(1)} KB</td></tr>`,
  );
}

writeFileSync(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Cadence email previews</title><style>body{font-family:system-ui;margin:32px}td,th{padding:6px 12px;text-align:left;border-bottom:1px solid #ddd}</style><h1>Cadence email previews (${TEMPLATE_IDS.length})</h1><table><tr><th>Group</th><th>Template</th><th>Category</th><th>Subject</th><th>Views</th><th>Size</th></tr>${rows.join("")}</table>`,
);
console.log(`Rendered ${TEMPLATE_IDS.length} templates to ${join("build", "email-previews")}/`);
