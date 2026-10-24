// Update notices from GET /api/version (docs/RELEASING.md, "Update banner"):
//
//   { "ios": { "latest": "1.0.0", "minimumBuild": 1, "appStoreUrl": null } }
//
// - Installed build (CFBundleVersion) below `minimumBuild`: a blocking screen.
// - Otherwise installed marketing version below `latest` (semantic versions):
//   a soft, dismissible banner.
// - Otherwise, or with no App Store URL, or when the request fails: nothing,
//   and never a block.
// Pure; tests/account.test.ts.

export interface VersionInfo {
  latest: string | null;
  minimumBuild: number | null;
  appStoreUrl: string | null;
}

export type UpdateNotice =
  | { kind: "none" }
  | { kind: "available"; version: string; storeUrl: string }
  | { kind: "required"; storeUrl: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function toBuild(value: unknown): number | null {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

export function parseVersionInfo(body: unknown): VersionInfo {
  const ios = isObject(body) && isObject(body.ios) ? body.ios : {};
  const url = typeof ios.appStoreUrl === "string" && /^https:\/\/(apps|itunes)\.apple\.com\//.test(ios.appStoreUrl) ? ios.appStoreUrl : null;
  return {
    latest: typeof ios.latest === "string" && /^\d+(\.\d+){0,2}$/.test(ios.latest) ? ios.latest : null,
    minimumBuild: toBuild(ios.minimumBuild),
    appStoreUrl: url,
  };
}

/** Negative when `a` is older than `b`, comparing up to three numeric parts. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function updateNotice(info: VersionInfo, installed: { version: string | null; build: number | null }): UpdateNotice {
  const storeUrl = info.appStoreUrl;
  if (!storeUrl) return { kind: "none" };
  if (info.minimumBuild !== null && installed.build !== null && installed.build < info.minimumBuild) return { kind: "required", storeUrl };
  if (info.latest && installed.version && compareVersions(installed.version, info.latest) < 0) return { kind: "available", version: info.latest, storeUrl };
  return { kind: "none" };
}
