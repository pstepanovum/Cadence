// FILE: scripts/email/assets.mjs
//
// Renders the email logo PNGs from the SVG logos in public/logo, at twice the
// size the emails show them (140 x 34), so they stay sharp on retina screens.
// Email clients do not render SVG, hence PNG. Needs rsvg-convert (librsvg).
//
//   node scripts/email/assets.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "public", "email");
mkdirSync(out, { recursive: true });

const renders = [
  // Named for the background they sit on: hunter green for light mail,
  // yellow-green for dark.
  ["logo-green-white.svg", "logo.png"],
  ["logo-green-dark.svg", "logo-dark.png"],
];

for (const [source, target] of renders) {
  execFileSync("rsvg-convert", ["--width", "280", "--keep-aspect-ratio", "-o", join(out, target), join(root, "public", "logo", source)]);
  console.log(`public/email/${target}`);
}
