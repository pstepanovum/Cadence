// FILE: mobile/src/platform/vocal-tract/animate.ts
//
// Motion for the mouth map. The model is parametric, so animating between two
// sounds is interpolating ten numbers and recomputing the contour: no path
// morphing. Diphthongs and other moving sounds are keyframe trajectories over
// the same parameters.
//
// Part of Cadence's port of the VocalTract LaTeX package by Dimitrios
// Ververidis (CTAN pkg/vocaltract; Ververidis, Schneider and Koehler, "The
// vocal tract LaTeX package", The PracTeX Journal, 2012, no. 1). Apache
// License 2.0 per the package README; LPPL per the VocalTract.sty header.
// See NOTICE and CREDITS.md.
//
// Twin: src/lib/platform/vocal-tract/animate.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

import { PARAM_KEYS, type VocalTractParams } from "./maeda.ts";

/**
 * Linear interpolation of every control. `t` is clamped to [0, 1].
 */
export function lerpParams(from: VocalTractParams, to: VocalTractParams, t: number): VocalTractParams {
  const k = Math.min(1, Math.max(0, t));
  const out = { ...from };
  for (const key of PARAM_KEYS) {
    out[key] = from[key] + (to[key] - from[key]) * k;
  }
  return out;
}

/** Slow in, slow out, the way articulators accelerate and settle. */
export function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** A point on a trajectory: `at` runs from 0 (start of the sound) to 1 (end). */
export interface Keyframe {
  at: number;
  params: VocalTractParams;
}

/**
 * The parameters at `t` along a trajectory of keyframes sorted by `at`, eased
 * between neighbours. A single keyframe is a steady sound.
 */
export function paramsAt(keyframes: readonly Keyframe[], t: number): VocalTractParams {
  if (keyframes.length === 0) throw new Error("A trajectory needs at least one keyframe.");
  const k = Math.min(1, Math.max(0, t));
  if (k <= keyframes[0].at) return keyframes[0].params;
  for (let i = 1; i < keyframes.length; i += 1) {
    const prev = keyframes[i - 1];
    const next = keyframes[i];
    if (k <= next.at) {
      const span = next.at - prev.at;
      const local = span <= 0 ? 1 : (k - prev.at) / span;
      return lerpParams(prev.params, next.params, easeInOut(local));
    }
  }
  return keyframes[keyframes.length - 1].params;
}

/**
 * Glottis pulse for voiced sounds, 0 to 1, a slow visual beat (not the real
 * vocal-fold frequency). Always 0 for a voiceless sound.
 */
export function glottisPulse(elapsedMs: number, voiced: boolean, beatsPerSecond = 4): number {
  if (!voiced) return 0;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * beatsPerSecond * elapsedMs) / 1000);
}
