// A small value kept in AsyncStorage and shared across the app: read once at
// launch, readable synchronously afterwards (haptics and sounds need that),
// and observable from React. Writes are best effort; the in-memory copy is
// what the app uses.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

export interface StoredValue<T> {
  get: () => T;
  set: (next: T | ((current: T) => T)) => void;
  /** Resolves once the stored copy has been read. */
  ready: Promise<void>;
  isLoaded: () => boolean;
  subscribe: (listener: () => void) => () => void;
  use: () => T;
}

export function storedValue<T>(key: string, parse: (raw: unknown) => T, fallback: T): StoredValue<T> {
  let value = fallback;
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  const ready = (async () => {
    try {
      const raw = await AsyncStorage.getItem(key);
      // A write before the read finished wins over the stored copy.
      if (raw !== null && !loaded) value = parse(JSON.parse(raw));
    } catch {
      // Unreadable: keep the fallback.
    }
    loaded = true;
    emit();
  })();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const get = () => value;

  return {
    get,
    set: (next) => {
      value = typeof next === "function" ? (next as (current: T) => T)(value) : next;
      loaded = true;
      emit();
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
    },
    ready,
    isLoaded: () => loaded,
    subscribe,
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}
