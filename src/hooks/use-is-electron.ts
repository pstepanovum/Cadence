'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleReady = () => onStoreChange()
  window.addEventListener('cadence-electron-ready', handleReady)

  // Force one immediate client-side re-check after hydration so desktop-only
  // shells update even when the server snapshot started as false.
  queueMicrotask(onStoreChange)

  return () => {
    window.removeEventListener('cadence-electron-ready', handleReady)
  }
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return Boolean(
    window.electron?.isElectron ||
      document.documentElement.classList.contains('electron'),
  )
}

/**
 * Returns true when running inside the Cadence Electron desktop app.
 *
 * Reads the preload bridge and the eagerly applied `.electron` html class.
 * This avoids state/effect timing issues in desktop-only shells like the
 * dashboard sidebar and top bar.
 */
export function useIsElectron(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
