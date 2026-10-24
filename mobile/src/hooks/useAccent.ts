// The accent the mouth map and the sounds library show: General American or
// Received Pronunciation, remembered on the phone.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import type { AccentVariant } from "@/platform/vocal-tract";

const KEY = "cadence.accent";
let current: AccentVariant = "GA";
const listeners = new Set<(accent: AccentVariant) => void>();
let loaded = false;

export function useAccent(): [AccentVariant, (accent: AccentVariant) => void] {
  const [accent, setAccent] = useState<AccentVariant>(current);

  useEffect(() => {
    listeners.add(setAccent);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((saved) => {
          if (saved === "GA" || saved === "RP") {
            current = saved;
            listeners.forEach((listener) => listener(saved));
          }
        })
        .catch(() => {});
    }
    return () => {
      listeners.delete(setAccent);
    };
  }, []);

  const choose = useCallback((next: AccentVariant) => {
    current = next;
    listeners.forEach((listener) => listener(next));
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  return [accent, choose];
}
