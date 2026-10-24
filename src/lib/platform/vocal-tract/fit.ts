// FILE: src/lib/platform/vocal-tract/fit.ts
//
// Fits Maeda's articulatory parameters to a reference contour: given target
// positions for some of the movable points (for example traced from a CC0
// sagittal-section drawing and moved into the package's coordinates), find the
// parameters whose contour comes closest. Used by the content pipeline to make
// English phoneme targets; never at runtime.
//
// Every movable point is linear in the parameters, so the squared error is a
// convex quadratic and coordinate descent with an exact step per coordinate
// converges to the box-constrained least-squares answer. Deterministic.
//
// Part of Cadence's port of the VocalTract LaTeX package by Dimitrios
// Ververidis (CTAN pkg/vocaltract; Ververidis, Schneider and Koehler, "The
// vocal tract LaTeX package", The PracTeX Journal, 2012, no. 1). Apache
// License 2.0 per the package README; LPPL per the VocalTract.sty header.
// See NOTICE and CREDITS.md.
//
// Twin: mobile/src/platform/vocal-tract/fit.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

import {
  ARTICULATORY_KEYS,
  NEUTRAL_PARAMS,
  PARAM_MAX,
  PARAM_MIN,
  computeVocalTract,
  type MovablePoints,
  type ParamKey,
  type Point,
  type VocalTractParams,
} from "./maeda.ts";

/**
 * Target positions for any subset of the movable points, with optional weights.
 */
export type FitTargets = Partial<Record<keyof MovablePoints, Point>>;

export interface FitOptions {
  /** Where to start; defaults to the relaxed position. */
  start?: VocalTractParams;
  /** Which parameters may move; defaults to Maeda's seven. */
  keys?: readonly ParamKey[];
  /** Per-point weights; default 1. */
  weights?: Partial<Record<keyof MovablePoints, number>>;
  /** Pull towards 0 (relaxed), in squared-error units per unit of parameter squared. */
  regularization?: number;
  /** Coordinate-descent sweeps; default 200. */
  sweeps?: number;
}

export interface FitResult {
  params: VocalTractParams;
  /** Root-mean-square distance over the targeted points, drawing units. */
  rms: number;
  /** Parameters that ended pinned at -3 or 3; worth a human look. */
  atBounds: ParamKey[];
}

function objective(
  params: VocalTractParams,
  targets: FitTargets,
  weights: FitOptions["weights"],
  regularization: number,
  keys: readonly ParamKey[],
): number {
  const { points } = computeVocalTract(params);
  let sum = 0;
  for (const name of Object.keys(targets) as (keyof MovablePoints)[]) {
    const target = targets[name];
    if (!target) continue;
    const w = weights?.[name] ?? 1;
    const dx = points[name].x - target.x;
    const dy = points[name].y - target.y;
    sum += w * (dx * dx + dy * dy);
  }
  for (const key of keys) sum += regularization * params[key] * params[key];
  return sum;
}

export function fitParams(targets: FitTargets, options: FitOptions = {}): FitResult {
  const names = (Object.keys(targets) as (keyof MovablePoints)[]).filter((name) => targets[name]);
  if (names.length === 0) throw new Error("Nothing to fit: no target points.");
  const keys = options.keys ?? ARTICULATORY_KEYS;
  const regularization = options.regularization ?? 0;
  const sweeps = options.sweeps ?? 200;
  const params = { ...(options.start ?? NEUTRAL_PARAMS) };
  const f = (p: VocalTractParams) => objective(p, targets, options.weights, regularization, keys);

  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    let moved = 0;
    for (const key of keys) {
      const at = (value: number) => f({ ...params, [key]: value });
      const current = params[key];
      const f0 = at(current);
      const fPlus = at(current + 1);
      const fMinus = at(current - 1);
      const a = (fPlus + fMinus - 2 * f0) / 2;
      const b = (fPlus - fMinus) / 2;
      if (a <= 1e-15) continue;
      const next = Math.min(PARAM_MAX, Math.max(PARAM_MIN, current - b / (2 * a)));
      moved = Math.max(moved, Math.abs(next - current));
      params[key] = next;
    }
    if (moved < 1e-10) break;
  }

  const { points } = computeVocalTract(params);
  let squared = 0;
  for (const name of names) {
    const target = targets[name]!;
    squared += (points[name].x - target.x) ** 2 + (points[name].y - target.y) ** 2;
  }
  return {
    params,
    rms: Math.sqrt(squared / names.length),
    atBounds: keys.filter((key) => Math.abs(params[key]) >= PARAM_MAX - 1e-9),
  };
}
