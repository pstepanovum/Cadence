// Traces the CC0 Wright/McCloy sagittal-section drawings into the vocal-tract
// model's drawing coordinates, so fitParams can turn a drawing into Maeda
// parameters. Everything is measured relative to the "Neutral" drawing of the
// same series: the model's relaxed shape (all parameters 0) stands for the
// neutral drawing, and each sound's target is the model's relaxed point moved
// by how far that sound's drawing moved from the neutral drawing. That keeps
// the two anatomies (the drawing's and the package's) from fighting.
//
// The drawings share one canvas and five paths: the palate with the upper
// teeth and upper lip, the tongue with the lower teeth, lower lip and jaw, the
// glottis, the larynx and the head. Their ids are not consistent across the
// series, so each is recognised by where it sits on the canvas.

import { pathToPolylines, pathsById } from "./svg-path.mjs";
import {
  MAEDA_TABLE,
  NEUTRAL_PARAMS,
  STATIC_POINTS,
  computeVocalTract,
  maedaToDrawingX,
  maedaToDrawingY,
} from "../../../src/lib/platform/vocal-tract/index.ts";

/** Tongue points the fit targets, with the Maeda grid line each lies on. */
export const TONGUE_ROWS = {
  tongueBase: 6,
  tonguePharynx: 7,
  tongueUvular: 12,
  tongueVelar: 15,
  tonguePalatal: 19,
  tonguePostAlveolar: 22,
  tongueBladeBack: 23,
  tongueBladeFront: 24,
  tongueAlveolar: 25,
};

/**
 * The model's fixed walls opposite the tongue: the back of the pharynx, the
 * velum (sealed) and the roof of the mouth to the upper incisor edge.
 */
const MODEL_WALL = (() => {
  const s = STATIC_POINTS;
  const velumBack = computeVocalTract({ ...NEUTRAL_PARAMS, velum: -3 }).points.velumBack;
  return [s.pharynxBackDown, s.pharynxBackMiddle, s.pharynxBackUp, velumBack, s.uvular, s.velar, s.palatal, s.postPostAlveolar, s.postAlveolar, s.alveolar, s.teethUpBaseIn, s.teethUpEdge];
})();

/**
 * Jaw scale: the package's German /a/ (codebook entry 7) has jaw -1.5, and the
 * series' "IPA a" drawing drops the lower incisor 5.6 canvas units below the
 * neutral drawing.
 */
export const JAW_AT_OPEN_A = -1.5;
export const OPEN_A_INCISOR_DROP = 5.6;

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function bounds(lines) {
  const pts = lines.flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** The drawing's parts by role: `palate`, `lower` (tongue, jaw, lower lip), `glottis` and `head`. */
export function parts(svgText) {
  const found = {};
  for (const d of Object.values(pathsById(svgText))) {
    const lines = pathToPolylines(d);
    const b = bounds(lines);
    let role = null;
    if (b.y1 - b.y0 < 6 && b.x1 - b.x0 < 25) role = "glottis";
    else if (b.x0 < 5 && b.y0 < 5) role = "head";
    else if (b.y0 > 100 && b.y1 < 150 && b.x1 > 150) role = "palate";
    else if (b.y1 > 240 && b.x0 > 90 && b.x1 > 150 && b.x1 < 170) role = "lower";
    if (role) {
      if (found[role]) throw new Error(`Two paths look like the ${role}.`);
      found[role] = lines;
    }
  }
  for (const role of ["palate", "lower", "glottis", "head"]) {
    if (!found[role]) throw new Error(`No path looks like the ${role}.`);
  }
  return found;
}

const inBox = (p, box) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;

/** Landmarks of one drawing, in its own units (y down). */
export function landmarks(svgText) {
  const found = parts(svgText);
  const palate = found.palate.flat();
  const lower = found.lower.flat();
  const glottis = found.glottis.flat();
  const pick = (pts, box, score) => {
    const hits = pts.filter((p) => inBox(p, box));
    if (hits.length === 0) throw new Error(`No drawing points in ${JSON.stringify(box)}.`);
    return hits.reduce((best, p) => (score(p) > score(best) ? p : best));
  };
  const xs = glottis.map((p) => p.x);
  const ys = glottis.map((p) => p.y);
  return {
    // The lowest point of the upper incisor.
    upperIncisor: pick(palate, { x0: 147, x1: 152.6, y0: 128, y1: 150 }, (p) => p.y),
    // The lowest point of the upper lip.
    upperLipBottom: pick(palate, { x0: 154, x1: 175, y0: 125, y1: 160 }, (p) => p.y),
    // The highest point of the lower lip.
    lowerLipTop: pick(lower, { x0: 153, x1: 175, y0: 128, y1: 165 }, (p) => -p.y),
    // The edge of the lower incisor: the highest point just behind the lip,
    // along the outline from the lip (the tongue tip comes much later).
    lowerIncisor: (() => {
      const top = pick(lower, { x0: 153, x1: 175, y0: 128, y1: 165 }, (p) => -p.y);
      const from = lower.indexOf(top);
      const window = lower.slice(from + 1, from + 46);
      return pick(window, { x0: 148.5, x1: 152.5, y0: 128, y1: 170 }, (p) => -p.y);
    })(),
    glottis: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
  };
}

/**
 * The similarity transform from the drawings' canvas into the model's drawing
 * coordinates, fixed by two landmarks of the neutral drawing: the upper
 * incisor edge and the centre of the glottis.
 */
export function calibrate(neutralSvg) {
  const lm = landmarks(neutralSvg);
  const relaxed = computeVocalTract(NEUTRAL_PARAMS).points;
  const a0 = { x: lm.upperIncisor.x, y: -lm.upperIncisor.y };
  const a1 = { x: lm.glottis.x, y: -lm.glottis.y };
  const b0 = { x: 2.185, y: 5.57 }; // STATIC_POINTS.teethUpEdge
  const b1 = mid(relaxed.chordsBack, relaxed.chordsFront);
  const va = { x: a1.x - a0.x, y: a1.y - a0.y };
  const vb = { x: b1.x - b0.x, y: b1.y - b0.y };
  const scale = Math.hypot(vb.x, vb.y) / Math.hypot(va.x, va.y);
  const angle = Math.atan2(vb.y, vb.x) - Math.atan2(va.y, va.x);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const point = (p) => {
    const x = p.x - a0.x;
    const y = -p.y - a0.y;
    return { x: b0.x + scale * (c * x - s * y), y: b0.y + scale * (s * x + c * y) };
  };
  /** A displacement (no translation). */
  const vector = (v) => ({ x: scale * (c * v.x + s * v.y), y: scale * (s * v.x - c * v.y) });
  return { scale, angle, point, vector };
}

/** Grid line `row` of Maeda's tongue grid in drawing coordinates, as a function of distance. */
export function gridLine(row) {
  const r = MAEDA_TABLE[row - 1];
  return (d) => ({ x: maedaToDrawingX(20 - (r[6] * d + r[8])), y: maedaToDrawingY(r[7] * d + r[9]) });
}

/** Distances along a grid line where it crosses a polyline (drawing coordinates). */
export function crossings(row, lines) {
  const at = gridLine(row);
  const p0 = at(0);
  const p1 = at(1);
  const dir = { x: p1.x - p0.x, y: p1.y - p0.y };
  const out = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1];
      const b = line[i];
      const e = { x: b.x - a.x, y: b.y - a.y };
      const den = dir.x * e.y - dir.y * e.x;
      if (Math.abs(den) < 1e-12) continue;
      const w = { x: a.x - p0.x, y: a.y - p0.y };
      const d = (w.x * e.y - w.y * e.x) / den;
      const u = (w.x * dir.y - w.y * dir.x) / den;
      if (u >= 0 && u <= 1) out.push(d);
    }
  }
  return out.sort((x, y) => x - y);
}

/** The drawing's tongue contour and lips in model coordinates. */
export function traceDrawing(svgText, calibration) {
  const found = parts(svgText);
  const tongue = found.lower.map((line) => line.map(calibration.point));
  const walls = [...found.palate, ...found.head].map((line) => line.map(calibration.point));
  return { tongue, walls, landmarks: landmarks(svgText) };
}

/**
 * Fit targets for one sound drawing, relative to the neutral drawing.
 * Returns target points for the model's movable points, or a note for any grid
 * line the drawing did not cross where expected.
 */
export function targetsFor(soundSvg, neutralSvg, calibration) {
  const relaxed = computeVocalTract(NEUTRAL_PARAMS).points;
  const sound = traceDrawing(soundSvg, calibration);
  const neutral = traceDrawing(neutralSvg, calibration);
  const modelWall = [MODEL_WALL];
  const targets = {};
  const notes = [];
  const nearest = (list, d) => list.reduce((best, x) => (Math.abs(x - d) < Math.abs(best - d) ? x : best), Infinity);
  for (const [name, row] of Object.entries(TONGUE_ROWS)) {
    const at = gridLine(row);
    const relaxedD = MAEDA_TABLE[row - 1][5];
    const n = nearest(crossings(row, neutral.tongue), relaxedD);
    const s = nearest(crossings(row, sound.tongue), n);
    if (!Number.isFinite(n) || !Number.isFinite(s) || Math.abs(s - n) > 3) {
      notes.push(`${name}: no clear tongue crossing on grid line ${row}`);
      continue;
    }
    // Preferred: the airway width on this grid line, from the tongue out to
    // the first wall beyond it (palate or pharynx), scaled per line so the
    // neutral drawing's width becomes the relaxed model's. A closure in the
    // drawing stays a closure in the model.
    const wallAhead = (walls, from) => crossings(row, walls).filter((d) => d > from + 1e-6)[0];
    const drawnWall = wallAhead(sound.walls, s);
    const neutralWall = wallAhead(neutral.walls, n);
    const modelWallD = wallAhead(modelWall, relaxedD - 3);
    if (drawnWall !== undefined && neutralWall !== undefined && modelWallD !== undefined && neutralWall - n > 0.05) {
      const ratio = Math.min(4, Math.max(0.25, (modelWallD - relaxedD) / (neutralWall - n)));
      targets[name] = at(modelWallD - ratio * Math.max(0, drawnWall - s));
      continue;
    }
    // Otherwise the relaxed model point moved as far as the drawing moved
    // from the neutral drawing.
    notes.push(`${name}: no wall on grid line ${row}; used the shift from neutral`);
    const shift = { x: at(s).x - at(n).x, y: at(s).y - at(n).y };
    targets[name] = { x: relaxed[name].x + shift.x, y: relaxed[name].y + shift.y };
  }

  // Lips: the drawings keep the lips' shape and only open or close them, so
  // only the aperture is measured; protrusion (rounding) is set from the
  // sound's features by the caller.
  const ls = sound.landmarks;
  const ln = neutral.landmarks;
  const apertureNeutral = ln.lowerLipTop.y - ln.upperLipBottom.y;
  const apertureSound = ls.lowerLipTop.y - ls.upperLipBottom.y;
  const apertureShift = calibration.scale * (apertureSound - apertureNeutral);
  const relaxedGap = relaxed.lipUpOut.y - relaxed.lipDownOut.y;
  const gap = Math.max(0, relaxedGap + apertureShift);
  targets.lipDownIn = { x: relaxed.lipDownIn.x, y: relaxed.lipUpOut.y - gap };
  // Jaw: the package moves the lower teeth only 0.015 units per jaw step, far
  // less than the drawings move them, so the jaw is not fitted to the teeth.
  // It is set from how far the lower incisor dropped below its neutral place,
  // scaled so that the series' /a/ gets the jaw of the package's own /a/.
  const drop = ls.lowerIncisor.y - ln.lowerIncisor.y;
  const jaw = Math.max(-3, Math.min(3, (JAW_AT_OPEN_A * drop) / OPEN_A_INCISOR_DROP));
  return { targets, notes, jaw, lipGap: gap };
}
