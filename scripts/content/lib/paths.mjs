// Where the content pipeline reads and writes.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const CONTENT_DIR = join(ROOT, "content");
export const CACHE_DIR = join(ROOT, "scripts/content/.cache");
export const PACKS_DIR = join(ROOT, "public/packs");
