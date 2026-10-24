// FILE: scripts/email/lint.ts
//
// Checks every rendered template for what breaks in real mail clients:
// styles inline on elements (the one <style> block in <head> carries only the
// dark palette and phone padding), no stylesheet but the Funnel Display font
// link, alt text on every image, absolute https images, a 560 px frame, no
// script, and under Gmail's 102 KB clip.
//
//   node --import ./tests/register.mjs scripts/email/lint.ts
import { TEMPLATE_IDS, renderFixture } from "../../src/lib/server/email/templates/index.ts";

const problems: string[] = [];
for (const id of TEMPLATE_IDS) {
  const { html } = renderFixture(id);
  const say = (text: string) => problems.push(`${id}: ${text}`);
  const head = html.slice(0, html.indexOf("</head>"));
  // Outlook-only markup inside conditional comments is exempt.
  const bodyPart = html.slice(html.indexOf("</head>")).replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, "");
  if ((html.match(/<style\b/g) ?? []).length !== 1 || !/<style>/.test(head)) say("exactly one <style>, in <head>");
  if (/<style\b/.test(bodyPart)) say("<style> in the body");
  const links = html.match(/<link\b[^>]*>/g) ?? [];
  if (links.length !== 1 || !links[0].includes("https://fonts.googleapis.com/")) say("the only <link> is the Google Fonts stylesheet");
  if (/<script\b/i.test(html)) say("no scripts");
  for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\salt="[^"]+"/.test(img)) say(`image without alt: ${img.slice(0, 80)}`);
    if (!/\ssrc="https:\/\//.test(img)) say(`image not on https: ${img.slice(0, 80)}`);
    if (!/\swidth="\d+"/.test(img)) say("image without a width attribute");
  }
  for (const tag of bodyPart.match(/<(p|h1|h2|td|a)\b[^>]*>/g) ?? []) {
    if (tag.startsWith("<td") && !/style=/.test(tag) && !/width=|align=/.test(tag)) say(`unstyled ${tag.slice(0, 60)}`);
    if (!tag.startsWith("<td") && !/style=/.test(tag)) say(`no inline style: ${tag.slice(0, 60)}`);
  }
  if (!/max-width:560px/.test(html)) say("not framed at 560 px");
  if (Buffer.byteLength(html) > 100 * 1024) say(`${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, over 100 KB`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${TEMPLATE_IDS.length} templates pass.`);
