// React hooks over the pack store: the packs on the phone, one level's
// content, and the remembered level for the Learn hub.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { packIdForLevel } from "@/content/catalog";
import { installedPacks, loadPack } from "@/content/packs";
import { useLearning } from "@/learning/store";
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

const LEVEL_KEY = "cadence.learn.level";

/** The level the hub opens on: the last one chosen, else the placement level, else A1. */
export function useLearnLevel(): [CefrLevel, (level: CefrLevel) => void] {
  const { state } = useLearning();
  const [level, setLevel] = useState<CefrLevel | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LEVEL_KEY)
      .then((saved) => {
        if (active && isCefrLevel(saved)) setLevel(saved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const choose = useCallback((next: CefrLevel) => {
    setLevel(next);
    AsyncStorage.setItem(LEVEL_KEY, next).catch(() => {});
  }, []);

  return [level ?? state.summary.placementLevel ?? "A1", choose];
}

export function parseLevelParam(value: unknown): CefrLevel {
  const raw = Array.isArray(value) ? value[0] : value;
  return isCefrLevel(raw) ? raw : "A1";
}

/** Sets the level the Learn hub opens on (onboarding's answer). */
export function rememberLearnLevel(level: CefrLevel): Promise<void> {
  return AsyncStorage.setItem(LEVEL_KEY, level).catch(() => {});
}
