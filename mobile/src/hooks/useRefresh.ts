import { useState } from "react";

import { haptics } from "@/lib/haptics";

/**
 * Pull-to-refresh state for a screen. The spinner shows only while the pull
 * the learner made is in flight, never for background refetches, and a light
 * tap says it is done.
 */
export function useRefresh(refresh: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
      haptics.tap();
    } catch {
      haptics.error();
    } finally {
      setRefreshing(false);
    }
  }

  return { refreshing, onRefresh };
}
