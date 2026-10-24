// FILE: src/components/mouth-map/use-articulation.ts
//
// Drives the mouth map frame by frame: the parameters at this moment (a steady
// sound, a diphthong's trajectory, or a morph from one sound to another) and
// the glottis beat. Animation is just interpolating the parameters and
// redrawing, at the display's frame rate. Reduced motion shows the end shape.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  easeInOut,
  glottisPulse,
  lerpParams,
  NEUTRAL_PARAMS,
  paramsAt,
  type ArticulationTarget,
  type VocalTractParams,
} from "@/lib/platform/vocal-tract/index.ts";

/** The shape at `t` (0 to 1) along a target: a trajectory, or its steady params. */
export function shapeAt(target: ArticulationTarget, t: number): VocalTractParams {
  if (target.trajectory && target.trajectory.length > 0) return paramsAt(target.trajectory, t);
  return target.params ?? NEUTRAL_PARAMS;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Options {
  target: ArticulationTarget;
  /** Morph from this target into `target`. */
  from?: ArticulationTarget | null;
  /** Bumped to replay the motion. */
  playKey: number;
  durationMs?: number;
}

export function useArticulation({ target, from, playKey, durationMs = 1200 }: Options) {
  const [t, setT] = useState(1);
  const [pulse, setPulse] = useState(0);
  const start = useRef(0);
  const voiced = target.voicing === "voiced";

  useEffect(() => {
    // Reduced motion: t stays at 1, the end shape.
    if (prefersReducedMotion()) return;
    let frame = 0;
    start.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start.current;
      const progress = Math.min(1, elapsed / durationMs);
      setT(progress);
      setPulse(glottisPulse(elapsed, voiced));
      if (progress < 1 || (voiced && elapsed < 8000)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, from, playKey, durationMs, voiced]);

  let params: VocalTractParams;
  if (from) {
    params = lerpParams(shapeAt(from, 1), shapeAt(target, 0), easeInOut(Math.min(1, t * 1.6)));
    if (t * 1.6 > 1 && target.trajectory) params = shapeAt(target, (t * 1.6 - 1) / 0.6);
  } else {
    params = shapeAt(target, target.trajectory ? t : 1);
  }
  return { params, pulse: voiced ? pulse : 0, playing: t < 1 };
}
