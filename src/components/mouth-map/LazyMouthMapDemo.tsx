// FILE: src/components/mouth-map/LazyMouthMapDemo.tsx
//
// The landing page's mouth map, split off the first load: the server draws
// the first sound as a still picture (`still`), and the animated demo and
// the model behind it are fetched once the page is idle.
"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { DemoSound } from "@/components/mouth-map/MouthMapDemo";

type Demo = ComponentType<{ sounds: DemoSound[] }>;

export function LazyMouthMapDemo({ sounds, still }: { sounds: DemoSound[]; still: ReactNode }) {
  const [Demo, setDemo] = useState<Demo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      void import("@/components/mouth-map/MouthMapDemo").then((m) => {
        if (!cancelled) setDemo(() => m.MouthMapDemo);
      });
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(start, 600);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  return Demo ? <Demo sounds={sounds} /> : <>{still}</>;
}
