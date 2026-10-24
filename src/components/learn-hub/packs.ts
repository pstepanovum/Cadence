// FILE: src/components/learn-hub/packs.ts
//
// Loads content packs in the browser from /packs (docs/PLATFORM.md 3.3):
// index.json, then each level's manifest and content.json. The service worker
// (public/sw.js) keeps them for offline use. A level with no readable pack
// falls back to the small built-in pack, so practice always works.
"use client";

import { useEffect, useState } from "react";
import { fixturePack } from "@/components/learn-hub/fixture-pack";
export { parseLevel } from "@/components/learn-hub/modes";
import {
  canReadPack,
  CEFR_LEVELS,
  type CefrLevel,
  type PackContent,
  type PackIndex,
  type PackManifest,
} from "@/lib/platform/content-model.ts";

export interface LoadedPack {
  level: CefrLevel;
  content: PackContent;
  /** "pack" from /packs, "builtin" when falling back. */
  source: "pack" | "builtin";
  /** Base URL for the pack's relative audio paths, when from /packs. */
  base: string | null;
}

let indexPromise: Promise<PackIndex | null> | null = null;
const packPromises = new Map<CefrLevel, Promise<LoadedPack>>();

function loadIndex(): Promise<PackIndex | null> {
  indexPromise ??= fetch("/packs/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<PackIndex>) : null))
    .catch(() => null);
  return indexPromise;
}

function resolve(path: string): string {
  return path.startsWith("/") ? path : `/packs/${path.replace(/^packs\//, "")}`;
}

async function loadFromPacks(level: CefrLevel): Promise<LoadedPack | null> {
  const index = await loadIndex();
  const entry = index?.packs
    .filter((pack) => pack.level === level)
    .sort((a, b) => b.version - a.version)[0];
  if (!entry) return null;
  const manifestUrl = resolve(entry.manifest);
  const manifest = (await fetch(manifestUrl).then((r) => (r.ok ? r.json() : null))) as PackManifest | null;
  if (!manifest || !canReadPack(manifest)) return null;
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
  const content = (await fetch(`${base}content.json`).then((r) => (r.ok ? r.json() : null))) as PackContent | null;
  if (!content || !Array.isArray(content.exercises)) return null;
  return { level, content, source: "pack", base };
}

export function loadPack(level: CefrLevel): Promise<LoadedPack> {
  let promise = packPromises.get(level);
  if (!promise) {
    promise = loadFromPacks(level)
      .catch(() => null)
      .then((pack) => pack ?? { level, content: fixturePack(level), source: "builtin" as const, base: null });
    packPromises.set(level, promise);
  }
  return promise;
}

export function usePack(level: CefrLevel | null) {
  const [pack, setPack] = useState<LoadedPack | null>(null);
  useEffect(() => {
    let live = true;
    if (level) void loadPack(level).then((loaded) => live && setPack(loaded));
    return () => {
      live = false;
    };
  }, [level]);
  // A pack for another level is stale while the new one loads.
  return pack && pack.level === level ? pack : null;
}

/** Every level's pack, for search across levels. */
export function useAllPacks() {
  const [packs, setPacks] = useState<LoadedPack[] | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all(CEFR_LEVELS.map(loadPack)).then((all) => live && setPacks(all));
    return () => {
      live = false;
    };
  }, []);
  return packs;
}

