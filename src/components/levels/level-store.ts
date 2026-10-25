// FILE: src/components/levels/level-store.ts
//
// The learner's level settings in the browser (docs/PLATFORM.md 7.1): the
// overall CEFR level, optional grammar, vocabulary and pronunciation levels,
// and the placement items already seen. Kept in this browser for everyone
// and, signed in to Cadence cloud, on the account through PATCH /api/profile;
// the newer copy wins (`syncLevelsWithAccount`). Practice, the grammar
// browser and the coach read the level from here, so a change applies at once.
"use client";

import { useSyncExternalStore } from "react";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { notifyStored } from "@/hooks/use-stored";
import { DEFAULT_LEVEL_PREFS, levelFor, newerLevelPrefs, parseLevelPrefs, prefsFromPlacement, withLevel, type LevelPrefs, type LevelSkill } from "@/lib/platform/levels.ts";
import { decodeSeen, encodeSeen, mergeSeen } from "@/lib/platform/placement.ts";
import type { CefrLevel } from "@/lib/platform/content-model.ts";

const LEVELS_KEY = "cadence.levels.v1";
const SEEN_KEY = "cadence.placement.seen.v1";
/** The level picker's old key; adopted once by browsers from before level settings. */
const LEGACY_KEY = "cadence.level";
const STORAGE_EVENT = "cadence:storage";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the change lasts for this page only.
  }
  notifyStored();
}

let cachedRaw: string | null | undefined;
let cachedPrefs: LevelPrefs = DEFAULT_LEVEL_PREFS;

/** The settings in this browser; the defaults (B2) when nothing is stored. */
export function readLevelPrefs(): LevelPrefs {
  if (typeof window === "undefined") return DEFAULT_LEVEL_PREFS;
  const raw = read(LEVELS_KEY);
  if (raw === cachedRaw) return cachedPrefs;
  cachedRaw = raw;
  let parsed: LevelPrefs | null = null;
  try {
    parsed = raw ? parseLevelPrefs(JSON.parse(raw)) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    const legacy = read(LEGACY_KEY)?.toUpperCase() ?? null;
    parsed = legacy && /^(A1|A2|B1|B2|C1|C2)$/.test(legacy) ? { ...DEFAULT_LEVEL_PREFS, overall: legacy as CefrLevel, source: "self" } : null;
  }
  cachedPrefs = parsed ?? DEFAULT_LEVEL_PREFS;
  return cachedPrefs;
}

function subscribe(listener: () => void) {
  window.addEventListener(STORAGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(STORAGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useLevelPrefs(): LevelPrefs {
  return useSyncExternalStore(subscribe, readLevelPrefs, () => DEFAULT_LEVEL_PREFS);
}

/** The level a skill practises at right now. */
export function useLearnerLevel(skill?: LevelSkill): CefrLevel {
  return levelFor(useLevelPrefs(), skill);
}

export function currentLevel(skill?: LevelSkill): CefrLevel {
  return levelFor(readLevelPrefs(), skill);
}

async function pushToAccount(patch: { levels?: LevelPrefs; placementSeen?: string }) {
  await cloudFetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
}

function save(prefs: LevelPrefs, signedIn: boolean) {
  write(LEVELS_KEY, JSON.stringify(prefs));
  if (signedIn) void pushToAccount({ levels: prefs });
}

export function setOverallLevel(level: CefrLevel, signedIn: boolean) {
  save(withLevel(readLevelPrefs(), { overall: level }, Date.now()), signedIn);
}

export function setSkillLevel(skill: LevelSkill, level: CefrLevel | null, signedIn: boolean) {
  save(withLevel(readLevelPrefs(), { skill, level }, Date.now()), signedIn);
}

export function applyPlacement(level: CefrLevel, skills: Partial<Record<LevelSkill, CefrLevel>>, signedIn: boolean) {
  save(prefsFromPlacement(level, skills, Date.now()), signedIn);
}

export function readSeen(): string {
  return typeof window === "undefined" ? "" : encodeSeen(decodeSeen(read(SEEN_KEY) ?? ""));
}

export function rememberSeen(ids: readonly string[], signedIn: boolean) {
  const merged = encodeSeen(new Set([...decodeSeen(readSeen()), ...ids]));
  write(SEEN_KEY, merged);
  if (signedIn) void pushToAccount({ placementSeen: merged });
}

/**
 * Brings this browser and the account into step: the newer level settings
 * win both ways and the seen placement items are merged. Signed-in pages call
 * it once when they open.
 */
export async function syncLevelsWithAccount(): Promise<void> {
  const response = await cloudFetch("/api/profile").catch(() => null);
  if (!response?.ok) return;
  const body = (await response.json().catch(() => null)) as { profile?: { levels?: unknown; placementSeen?: unknown } } | null;
  const remote = parseLevelPrefs(body?.profile?.levels);
  const local = readLevelPrefs();
  const newer = newerLevelPrefs(local.updatedAt > 0 ? local : null, remote);
  const patch: { levels?: LevelPrefs; placementSeen?: string } = {};
  if (newer && newer === remote && JSON.stringify(remote) !== JSON.stringify(local)) write(LEVELS_KEY, JSON.stringify(remote));
  if (newer && newer !== remote && JSON.stringify(newer) !== JSON.stringify(remote)) patch.levels = newer;
  const remoteSeen = typeof body?.profile?.placementSeen === "string" ? body.profile.placementSeen : "";
  const merged = mergeSeen(readSeen(), remoteSeen);
  if (merged !== readSeen()) write(SEEN_KEY, merged);
  if (merged !== encodeSeen(decodeSeen(remoteSeen))) patch.placementSeen = merged;
  if (patch.levels || patch.placementSeen !== undefined) await pushToAccount(patch);
}
