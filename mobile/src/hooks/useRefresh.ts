import { useState } from "react";

/**
 * Pull-to-refresh state for a screen. The spinner shows only while the pull
 * the learner made is in flight, never for background refetches.
 */
export function useRefresh(refresh: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return { refreshing, onRefresh };
}
