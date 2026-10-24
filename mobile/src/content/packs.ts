// Content packs on the phone (docs/PLATFORM.md, section 3.3).
//
// `sounds` and `core-a1` to `core-b2` ship inside the app as assets
// (bundled.generated.ts); `core-c1`, `core-c2` and newer versions of any pack
// are downloaded on demand into the documents directory, checked against the
// manifest's SHA-256 sums, and can be removed again from Settings. A pack is
// read from disk the first time a screen needs it and kept in memory after.
//
// Packs are static files: they come from the hosted site or the paired
// Cadence server, never from Firestore, and need no account.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { BUNDLED_PACKS, BUNDLED_SOURCE } from "@/content/bundled.generated";
import { EMPTY_PACK, levelForPackId } from "@/content/catalog";
import {
  canReadPack,
  isCefrLevel,
  packsToUpdate,
  type CefrLevel,
  type PackContent,
  type PackIndex,
  type PackManifest,
} from "@/platform/content-model";

export { BUNDLED_SOURCE };

export interface InstalledPack {
  id: string;
  version: number;
  level: CefrLevel | null;
  title: string;
  bytes: number;
  /** Shipped in the app (cannot be removed) or downloaded. */
  origin: "bundled" | "downloaded";
}

interface DownloadedRecord {
  version: number;
  title: string;
  level: CefrLevel | null;
  bytes: number;
}

const REGISTRY_KEY = "cadence.packs.downloaded";
const ROOT = "packs";

let registry: Record<string, DownloadedRecord> | null = null;
const loaded = new Map<string, Promise<PackContent>>();

async function readRegistry(): Promise<Record<string, DownloadedRecord>> {
  if (registry) return registry;
  try {
    const raw = await AsyncStorage.getItem(REGISTRY_KEY);
    registry = raw ? (JSON.parse(raw) as Record<string, DownloadedRecord>) : {};
  } catch {
    registry = {};
  }
  return registry;
}

async function writeRegistry(next: Record<string, DownloadedRecord>): Promise<void> {
  registry = next;
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next)).catch(() => {});
}

function packDir(id: string, version: number): Directory {
  return new Directory(Paths.document, ROOT, id, `v${version}`);
}

/** Every pack on the phone, the newest copy of each id. */
export async function installedPacks(): Promise<InstalledPack[]> {
  const downloaded = await readRegistry();
  const byId = new Map<string, InstalledPack>();
  for (const pack of BUNDLED_PACKS) {
    byId.set(pack.id, {
      id: pack.id,
      version: pack.version,
      level: isCefrLevel(pack.level) ? pack.level : null,
      title: pack.title,
      bytes: pack.bytes,
      origin: "bundled",
    });
  }
  for (const [id, record] of Object.entries(downloaded)) {
    const current = byId.get(id);
    if (!current || record.version > current.version) {
      byId.set(id, { id, version: record.version, level: record.level, title: record.title, bytes: record.bytes, origin: "downloaded" });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function parseContent(text: string): PackContent {
  const body = JSON.parse(text) as Partial<PackContent>;
  return {
    topics: Array.isArray(body.topics) ? body.topics : [],
    grammarPoints: Array.isArray(body.grammarPoints) ? body.grammarPoints : [],
    lessons: Array.isArray(body.lessons) ? body.lessons : [],
    exercises: Array.isArray(body.exercises) ? body.exercises : [],
  };
}

async function readBundled(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (!asset.localUri) await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).text();
}

/**
 * The content of a pack, or the empty pack when it is not on the phone. Read
 * once, then served from memory.
 */
export function loadPack(id: string): Promise<PackContent> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const promise = (async () => {
    const installed = (await installedPacks()).find((pack) => pack.id === id);
    if (!installed) return EMPTY_PACK;
    if (installed.origin === "downloaded") {
      return parseContent(await new File(packDir(id, installed.version), "content.json").text());
    }
    const bundled = BUNDLED_PACKS.find((pack) => pack.id === id);
    return bundled ? parseContent(await readBundled(bundled.content)) : EMPTY_PACK;
  })();
  loaded.set(id, promise);
  promise.catch(() => loaded.delete(id));
  return promise;
}

/** A local URI for a pack's pre-generated audio, or null when the pack has none. */
export async function packAudioUri(id: string, path: string): Promise<string | null> {
  const installed = (await installedPacks()).find((pack) => pack.id === id);
  if (!installed) return null;
  if (installed.origin === "downloaded") {
    const file = new File(packDir(id, installed.version), path);
    return file.exists ? file.uri : null;
  }
  const module = BUNDLED_PACKS.find((pack) => pack.id === id)?.audio[path];
  if (module === undefined) return null;
  const asset = Asset.fromModule(module);
  if (!asset.localUri) await asset.downloadAsync();
  return asset.localUri ?? null;
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export interface AvailablePack {
  id: string;
  version: number;
  level: CefrLevel | null;
  bytes: number;
  manifest: string;
}

/** What the server offers that is newer than what the phone has. */
export async function availableUpdates(baseUrl: string): Promise<AvailablePack[]> {
  const response = await fetch(`${baseUrl}/packs/index.json`);
  // A server that has not published any packs yet simply has nothing more to offer.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Could not load the list of content packs.");
  const index = (await response.json()) as PackIndex;
  const installed = Object.fromEntries((await installedPacks()).map((pack) => [pack.id, pack.version]));
  return packsToUpdate(index, installed).map((entry) => ({
    id: entry.id,
    version: entry.version,
    level: entry.level ?? levelForPackId(entry.id),
    bytes: entry.bytes,
    manifest: entry.manifest,
  }));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function joinUrl(baseUrl: string, path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${baseUrl}/${clean.startsWith("packs/") ? clean : `packs/${clean}`}`;
}

/**
 * Downloads every file of a pack, checks each against the manifest, and only
 * then makes it the installed copy. A failed or tampered download leaves the
 * previous copy in place.
 */
export async function downloadPack(baseUrl: string, pack: AvailablePack, onProgress?: (done: number, total: number) => void): Promise<void> {
  const manifestUrl = joinUrl(baseUrl, pack.manifest);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error("Could not load the pack's manifest.");
  const manifest = (await response.json()) as PackManifest;
  if (!canReadPack(manifest) || manifest.id !== pack.id) throw new Error("This pack needs a newer version of Cadence.");

  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/"));
  const dir = packDir(pack.id, manifest.version);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });

  try {
    let done = 0;
    for (const entry of manifest.files) {
      const target = new File(dir, entry.path);
      const parent = new Directory(target.parentDirectory.uri);
      if (!parent.exists) parent.create({ intermediates: true });
      const file = await File.downloadFileAsync(`${base}/${entry.path}`, target, { idempotent: true });
      const digest = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes()));
      if (digest !== entry.sha256) throw new Error(`A file in the ${pack.id} pack did not match its checksum.`);
      done += 1;
      onProgress?.(done, manifest.files.length);
    }
    // Parse once before switching over, so a malformed file never becomes the installed copy.
    parseContent(await new File(dir, "content.json").text());
  } catch (error) {
    if (dir.exists) dir.delete();
    throw error;
  }

  const current = await readRegistry();
  const previous = current[pack.id];
  await writeRegistry({
    ...current,
    [pack.id]: {
      version: manifest.version,
      title: manifest.title,
      level: manifest.level ?? null,
      bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    },
  });
  if (previous && previous.version !== manifest.version) {
    const old = packDir(pack.id, previous.version);
    if (old.exists) old.delete();
  }
  loaded.delete(pack.id);
}

/** Removes a downloaded pack; a bundled pack falls back to the copy in the app. */
export async function removeDownloadedPack(id: string): Promise<void> {
  const current = await readRegistry();
  const record = current[id];
  if (!record) return;
  const dir = new Directory(Paths.document, ROOT, id);
  if (dir.exists) dir.delete();
  const next = { ...current };
  delete next[id];
  await writeRegistry(next);
  loaded.delete(id);
}

export function isBundled(id: string): boolean {
  return BUNDLED_PACKS.some((pack) => pack.id === id);
}
