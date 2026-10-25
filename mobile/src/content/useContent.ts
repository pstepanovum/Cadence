// React hooks over the pack store: the packs on the phone, one level's
// content, the placement bank, and the level the Learn hub opens on.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { packIdForLevel } from "@/content/catalog";
import { installedPacks, loadPack } from "@/content/packs";
import { adoptStartingLevel, currentLevel, levelPrefs, setOverallLevel, useLevelPrefs } from "@/learning/level-store";
import { useLearning } from "@/learning/store";
import { levelFor } from "@/platform/levels";
import { isCefrLevel, type CefrLevel } from "@/platform/content-model";

export function useInstalledPacks() {
  return useQuery({ queryKey: ["packs", "installed"], queryFn: installedPacks, staleTime: Infinity });
}

/** One level's pack: null data when it is not on the phone. */
export function useLevelPack(level: CefrLevel) {
  const installed = useInstalledPacks();
  const id = packIdForLevel(level);
  const entry = installed.data?.find((pack) => pack.id === id) ?? null;
  const pack = useQuery({
    queryKey: ["pack", id, entry?.version ?? 0],
    queryFn: () => loadPack(id),
    enabled: entry !== null,
    staleTime: Infinity,
  });
  return {
    installed: entry,
    content: pack.data ?? null,
    isLoading: installed.isLoading || (entry !== null && pack.isLoading),
    isError: pack.isError,
    refetch: pack.refetch,
  };
}

const LEGACY_LEVEL_KEY = "cadence.learn.level";

/** What the hub is showing when the learner browses away from their level; forgotten when the level changes. */
let browsing: { level: CefrLevel; basedOn: number } | null = null;

/**
 * The level the Learn hub opens on: the learner's current level (Settings >
 * Level, or setup), so lessons, quizzes and flashcards follow a change at
 * once. Choosing another level in the hub browses it without changing the
 * learner's level. Installs from before level settings adopt the level they
 * last chose, else their placement level.
 */
export function useLearnLevel(): [CefrLevel, (level: CefrLevel) => void] {
  const { state } = useLearning();
  const prefs = useLevelPrefs();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (prefs.updatedAt > 0) return;
    let active = true;
    levelPrefs.ready
      .then(() => AsyncStorage.getItem(LEGACY_LEVEL_KEY))
      .then((saved) => {
        if (!active || levelPrefs.get().updatedAt > 0) return;
        const level = isCefrLevel(saved) ? saved : state.summary.placementLevel;
        if (level) setOverallLevel(level);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [prefs.updatedAt, state.summary.placementLevel]);

  const choose = useCallback(
    (next: CefrLevel) => {
      browsing = { level: next, basedOn: prefs.updatedAt };
      setTick((n) => n + 1);
    },
    [prefs.updatedAt],
  );

  const current = levelFor(prefs, "grammar");
  const shown = browsing && browsing.basedOn === prefs.updatedAt ? browsing.level : current;
  return [shown, choose];
}

/** A screen's level parameter, else the learner's current level. */
export function parseLevelParam(value: unknown): CefrLevel {
  const raw = Array.isArray(value) ? value[0] : value;
  return isCefrLevel(raw) ? raw : currentLevel("grammar");
}

/** The placement test's bank (the bundled `placement` pack), or null while it loads or when it is missing. */
export function usePlacementBank() {
  const installed = useInstalledPacks();
  const entry = installed.data?.find((pack) => pack.id === "placement") ?? null;
  const pack = useQuery({
    queryKey: ["pack", "placement", entry?.version ?? 0],
    queryFn: () => loadPack("placement"),
    enabled: entry !== null,
    staleTime: Infinity,
  });
  return { content: pack.data ?? null, isLoading: installed.isLoading || (entry !== null && pack.isLoading), missing: !installed.isLoading && entry === null };
}

/** The level setup chose (self-check or quiz) becomes the learner's level. */
export function rememberLearnLevel(level: CefrLevel): Promise<void> {
  adoptStartingLevel(level);
  return Promise.resolve();
}
