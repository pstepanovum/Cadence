// FILE: store/screenshot-studio/src/config-io.ts
import { mergeConfig, type StudioConfig } from "./config";

export type RawManifest = Record<string, { width: number; height: number; mtime: number }>;

export async function loadConfig(): Promise<StudioConfig> {
  const response = await fetch("/__config", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return mergeConfig(null);
  return mergeConfig((await response.json().catch(() => null)) as Partial<StudioConfig> | null);
}

export async function saveConfig(config: StudioConfig): Promise<boolean> {
  const response = await fetch("/__config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }).catch(() => null);
  return Boolean(response?.ok);
}

export async function loadRawManifest(): Promise<RawManifest> {
  const response = await fetch("/__raw/manifest", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return {};
  return ((await response.json()) as { files: RawManifest }).files ?? {};
}

/** Marks the page ready once fonts and every image inside `root` have loaded; the export waits for it. */
export async function markReadyWhenPainted(root: HTMLElement) {
  await document.fonts.ready;
  const settle = (img: HTMLImageElement) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((done) => {
          img.addEventListener("load", () => done(), { once: true });
          img.addEventListener("error", () => done(), { once: true });
        });
  await Promise.all(Array.from(root.querySelectorAll("img"), settle));
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  document.documentElement.dataset.ready = "1";
}
