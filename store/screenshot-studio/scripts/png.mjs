// FILE: store/screenshot-studio/scripts/png.mjs
//
// App Store Connect refuses screenshots with an alpha channel, and Chromium
// writes RGBA even for an opaque page. Each export is decoded and written
// again as 8-bit RGB (colour type 2), over white where a pixel is not opaque.
import { readFile, writeFile } from "node:fs/promises";

import pngjs from "pngjs";

const { PNG } = pngjs;

export async function writeOpaquePng(source, target = source) {
  const png = PNG.sync.read(await readFile(source));
  const { data } = png;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha === 1) continue;
    for (let c = 0; c < 3; c += 1) data[i + c] = Math.round(data[i + c] * alpha + 255 * (1 - alpha));
    data[i + 3] = 255;
  }
  await writeFile(target, PNG.sync.write(png, { colorType: 2, inputColorType: 6, inputHasAlpha: true, bitDepth: 8 }));
}
