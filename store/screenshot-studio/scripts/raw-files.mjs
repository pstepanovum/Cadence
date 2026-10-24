// FILE: store/screenshot-studio/scripts/raw-files.mjs
//
// The simulator captures in store/screenshots/raw/<slug>.png, with their real
// pixel size read from the PNG header. Shared by vite.config.ts (the
// dashboard's API) and export.mjs.
import { open, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const RAW_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "screenshots", "raw");

/** A plain lowercase slug; nothing else is served. */
export const RAW_NAME = /^[a-z0-9][a-z0-9-]*\.png$/;

/** { width, height, colorType } from the IHDR chunk, or null for a file that is not a PNG. */
export async function readPngSize(file) {
  const handle = await open(file, "r");
  try {
    const buf = Buffer.alloc(26);
    const { bytesRead } = await handle.read(buf, 0, 26, 0);
    if (bytesRead < 26 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
  } finally {
    await handle.close();
  }
}

/** Every capture keyed "<slug>.png": { width, height, mtime }; 0 x 0 for a non-PNG. */
export async function rawManifest(rawDir = RAW_DIR) {
  const files = {};
  for (const name of await readdir(rawDir).catch(() => [])) {
    if (!RAW_NAME.test(name)) continue;
    const path = join(rawDir, name);
    const size = (await readPngSize(path).catch(() => null)) ?? { width: 0, height: 0 };
    files[name] = { width: size.width, height: size.height, mtime: Math.round((await stat(path)).mtimeMs) };
  }
  return files;
}
