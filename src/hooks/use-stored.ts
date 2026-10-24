// FILE: src/hooks/use-stored.ts
//
// Reads browser-only values during render without an effect: a localStorage
// string, or any client-side check. The server snapshot is the fallback, so
// hydration matches and the real value appears right after.
"use client";

import { useSyncExternalStore } from "react";

const STORAGE_EVENT = "cadence:storage";

function subscribeStorage(listener: () => void) {
  window.addEventListener(STORAGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(STORAGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The raw localStorage value for `key`, re-read when any Cadence write or another tab changes it. */
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );
}

/** Writes a value and tells every useStoredString reader. */
export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the value lives only for this render.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function notifyStored() {
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

const noop = () => () => {};

/** A client-only boolean (feature checks), false on the server. */
export function useClientCheck(check: () => boolean): boolean {
  return useSyncExternalStore(noop, check, () => false);
}
