// FILE: store/screenshot-studio/scripts/copy-assets.mjs
//
// Copies what the slides draw with into public/ (ignored by git): the two
// Cadence typefaces from the mobile app's font packages (Funnel Display for
// text, Sour Gummy for the kicker; both SIL Open Font License), the Cadence
// mark and the illustrations the web and the app already use.
//
//   npm run assets
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studio = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(studio, "..", "..");
const fonts = join(repo, "mobile/node_modules/@expo-google-fonts");

const FILES = [
  [join(fonts, "funnel-display/500Medium/FunnelDisplay_500Medium.ttf"), "fonts/FunnelDisplay-500.ttf"],
  [join(fonts, "funnel-display/600SemiBold/FunnelDisplay_600SemiBold.ttf"), "fonts/FunnelDisplay-600.ttf"],
  [join(fonts, "funnel-display/700Bold/FunnelDisplay_700Bold.ttf"), "fonts/FunnelDisplay-700.ttf"],
  [join(fonts, "sour-gummy/600SemiBold/SourGummy_600SemiBold.ttf"), "fonts/SourGummy-600.ttf"],
  [join(fonts, "sour-gummy/700Bold/SourGummy_700Bold.ttf"), "fonts/SourGummy-700.ttf"],
  [join(repo, "mobile/assets/svg/icon-green-white.svg"), "brand/mark.svg"],
  [join(repo, "mobile/assets/svg/logo-green-white.svg"), "brand/logo.svg"],
];

export async function copyAssets({ quiet = false } = {}) {
  const out = join(studio, "public");
  for (const [from, to] of FILES) {
    await mkdir(dirname(join(out, to)), { recursive: true });
    try {
      await copyFile(from, join(out, to));
    } catch {
      throw new Error(`Missing ${from}. Run npm install in mobile/ first.`);
    }
  }
  const illustrations = join(repo, "public/illustration");
  await mkdir(join(out, "illustration"), { recursive: true });
  for (const name of await readdir(illustrations)) {
    if (name.endsWith(".svg")) await copyFile(join(illustrations, name), join(out, "illustration", name));
  }
  if (!quiet) console.log(`Copied fonts, the mark and illustrations into ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await copyAssets();
}
