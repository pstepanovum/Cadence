// FILE: src/components/learn-hub/PackCacheRegistration.tsx
//
// Registers public/sw.js, which keeps content packs available offline. Skipped
// in development (stale caches get in the way) and where the browser has no
// service workers.
"use client";

import { useEffect } from "react";

export function PackCacheRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline packs are a convenience; the app works without them.
    });
  }, []);
  return null;
}
