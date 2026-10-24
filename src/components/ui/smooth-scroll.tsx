"use client";

// Smooth wheel scrolling on the web. Lenis is fetched after the page is
// interactive, so it never weighs on the first load; until then (and with
// reduced motion) the browser scrolls natively.
import { useEffect, type ReactNode } from "react";

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lenis: { destroy(): void } | null = null;
    let cancelled = false;
    void import("lenis").then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ lerp: 0.1, duration: 1.5, smoothWheel: true, autoRaf: true });
    });
    return () => {
      cancelled = true;
      lenis?.destroy();
    };
  }, []);

  return <>{children}</>;
}
