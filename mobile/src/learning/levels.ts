// Keeps the level settings on the phone (level-store.ts) and on the account in
// step while signed in to Cadence cloud. Everything else about levels is
// re-exported from level-store.ts.
import { useEffect, useRef } from "react";

import { useAuth } from "@/context/auth";
import { levelPrefs, placementSeen, useLevelPrefs, usePlacementSeen } from "@/learning/level-store";
import { newerLevelPrefs, type LevelPrefs } from "@/platform/levels";
import { decodeSeen, encodeSeen, mergeSeen } from "@/platform/placement";

export * from "@/learning/level-store";

/**
 * Keeps the phone and the account in step while signed in: the newer level
 * settings win both ways, and the seen placement items are the union of both.
 * Mounted once, by EngagementWatcher.
 */
export function useLevelSync(): void {
  const { user, profile, profileReady, updateProfile } = useAuth();
  const local = useLevelPrefs();
  const seen = usePlacementSeen();
  const pushing = useRef(false);
  const remoteLevels = profile.levels ?? null;
  const remoteSeen = profile.placementSeen ?? "";

  useEffect(() => {
    if (!user || !profileReady || pushing.current) return;
    const newer = newerLevelPrefs(local.updatedAt > 0 ? local : null, remoteLevels);
    const patch: { levels?: LevelPrefs; placementSeen?: string } = {};
    if (newer && newer !== local && JSON.stringify(newer) !== JSON.stringify(local)) levelPrefs.set(newer);
    if (newer && newer === local && JSON.stringify(local) !== JSON.stringify(remoteLevels)) patch.levels = local;
    const merged = mergeSeen(seen, remoteSeen);
    if (merged !== seen) placementSeen.set(merged);
    if (merged !== encodeSeen(decodeSeen(remoteSeen))) patch.placementSeen = merged;
    if (!patch.levels && patch.placementSeen === undefined) return;
    pushing.current = true;
    updateProfile(patch)
      .catch(() => {})
      .finally(() => {
        pushing.current = false;
      });
  }, [user, profileReady, local, seen, remoteLevels, remoteSeen, updateProfile]);
}
