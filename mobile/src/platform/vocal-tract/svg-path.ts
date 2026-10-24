// FILE: mobile/src/platform/vocal-tract/svg-path.ts
//
// Turns the vocal-tract layers into SVG path data for a pixel viewport, so the
// web (SVG) and the phone (react-native-svg) draw exactly the same outline.
// Smooth runs are Catmull-Rom curves through their points, close to what the
// package's pscurve draws. Pure string building; cheap enough to run every
// animation frame.
//
// Part of Cadence's port of the VocalTract LaTeX package by Dimitrios
// Ververidis (CTAN pkg/vocaltract; Ververidis, Schneider and Koehler, "The
// vocal tract LaTeX package", The PracTeX Journal, 2012, no. 1). Apache
// License 2.0 per the package README; LPPL per the VocalTract.sty header.
// See NOTICE and CREDITS.md.
//
// Twin: src/lib/platform/vocal-tract/svg-path.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

import type { Point } from "./maeda.ts";
import type { Run, Subpath } from "./geometry.ts";

/**
 * Maps drawing coordinates (y up) to pixels (y down) for a box of the drawing.
 */
export interface Viewport {
  width: number;
  height: number;
  scale: number;
  toPixels(point: Point): Point;
}

export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function createViewport(box: Box, width: number): Viewport {
  const scale = width / (box.maxX - box.minX);
  const height = (box.maxY - box.minY) * scale;
  return {
    width,
    height,
    scale,
    toPixels: (p) => ({ x: (p.x - box.minX) * scale, y: (box.maxY - p.y) * scale }),
  };
}

const fmt = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const pt = (p: Point) => `${fmt(p.x)} ${fmt(p.y)}`;

/** Path commands for one run, starting from its first point (no move-to). */
function runCommands(run: Run, toPixels: (p: Point) => Point): string[] {
  const points = run.points.map(toPixels);
  if (points.length < 2) return [];
  if (!run.smooth) {
    return points.slice(1).map((p) => `L${pt(p)}`);
  }
  const first = points[0];
  const last = points[points.length - 1];
  const before = run.before ? toPixels(run.before) : { x: 2 * first.x - points[1].x, y: 2 * first.y - points[1].y };
  const after = run.after
    ? toPixels(run.after)
    : { x: 2 * last.x - points[points.length - 2].x, y: 2 * last.y - points[points.length - 2].y };
  const all = [before, ...points, after];
  const commands: string[] = [];
  for (let i = 1; i < all.length - 2; i += 1) {
    const p0 = all[i - 1];
    const p1 = all[i];
    const p2 = all[i + 1];
    const p3 = all[i + 2];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    commands.push(`C${pt(c1)} ${pt(c2)} ${pt(p2)}`);
  }
  return commands;
}

/** SVG `d` for one subpath. Runs join end to end; a gap between runs becomes a line. */
export function subpathToSvg(subpath: Subpath, viewport: Viewport): string {
  const parts: string[] = [];
  let cursor: Point | null = null;
  for (const run of subpath.runs) {
    if (run.points.length === 0) continue;
    const start = viewport.toPixels(run.points[0]);
    if (cursor === null) {
      parts.push(`M${pt(start)}`);
    } else if (fmt(cursor.x) !== fmt(start.x) || fmt(cursor.y) !== fmt(start.y)) {
      parts.push(`L${pt(start)}`);
    }
    parts.push(...runCommands(run, viewport.toPixels));
    cursor = viewport.toPixels(run.points[run.points.length - 1]);
  }
  if (subpath.closed && parts.length > 0) parts.push("Z");
  return parts.join(" ");
}

/** SVG `d` for several subpaths, as one path element. */
export function subpathsToSvg(subpaths: readonly Subpath[], viewport: Viewport): string {
  return subpaths.map((subpath) => subpathToSvg(subpath, viewport)).join(" ");
}
