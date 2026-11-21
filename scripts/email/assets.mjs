// FILE: scripts/email/assets.mjs
//
// Renders the email images: the logo PNGs from the SVG logos in public/logo, at twice the
// size the emails show them (140 x 34), so they stay sharp on retina screens.
// Email clients do not render SVG, hence PNG. Needs rsvg-convert (librsvg).
//
//   node scripts/email/assets.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Icons: the lucide icons the iPhone app itself uses (lucide-react-native in
// mobile/, so run `npm ci` there first), drawn at 24 px and saved at 3x as
// transparent PNGs, one in hunter green for light mail and one in
// yellow-green for dark. Only icons the app already shows belong here.
export const EMAIL_ICONS = {
  clock: "clock-3",
  flame: "flame",
  "list-checks": "list-checks",
  award: "award",
  mic: "mic",
  "messages-square": "messages-square",
  "audio-lines": "audio-lines",
  cloud: "cloud",
  layers: "layers",
  "book-open": "book-open",
  "check-circle": "circle-check",
  sparkles: "sparkles",
  gamepad: "gamepad-2",
};
const lucide = join(root, "mobile", "node_modules", "lucide-react-native", "dist", "esm", "icons");
const iconsOut = join(out, "icons");
mkdirSync(iconsOut, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "cadence-icons-"));

function iconNodes(file) {
  // Each module calls createLucideIcon(name, nodes); evaluate just that array.
  const source = readFileSync(join(lucide, `${file}.mjs`), "utf8");
  const start = source.indexOf("[", source.indexOf("createLucideIcon("));
  const end = source.lastIndexOf("]);");
  return Function(`"use strict"; return (${source.slice(start, end + 1)});`)();
}

function svgFor(nodes, color) {
  const children = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== "key").map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

for (const [name, file] of Object.entries(EMAIL_ICONS)) {
  const nodes = iconNodes(file);
  for (const [suffix, color] of [["", "#386641"], ["-dark", "#A7C957"]]) {
    const svg = join(tmp, `${name}${suffix}.svg`);
    writeFileSync(svg, svgFor(nodes, color));
    execFileSync("rsvg-convert", ["--width", "72", "--height", "72", "-o", join(iconsOut, `${name}${suffix}.png`), svg]);
  }
  console.log(`public/email/icons/${name}.png, ${name}-dark.png`);
}

// The real App Store icon (mobile/assets/images/ios-icon.png), small, for the
// header and footer. Mail rounds its corners with border-radius.
execFileSync("sips", ["-Z", "108", join(root, "mobile", "assets", "images", "ios-icon.png"), "--out", join(out, "app-icon.png")], { stdio: "ignore" });
console.log("public/email/app-icon.png");
