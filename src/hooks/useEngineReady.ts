"use client";

import { useEffect, useState } from "react";

const RETRY_MS = 4000;

/**
 * Whether the pronunciation engine is ready, from `GET /api/assess`. While it
 * is warming up the check repeats every few seconds until it reports ready.
 */
export function useEngineReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function check() {
      let next = false;

      try {
        const response = await fetch("/api/assess", { method: "GET", cache: "no-store" });
        const payload = (await response.json()) as { ready?: boolean };
        next = payload.ready === true;
      } catch {
        next = false;
      }

      if (cancelled) return;
      setReady(next);
      if (!next) timer = window.setTimeout(check, RETRY_MS);
    }

    void check();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return ready;
}
