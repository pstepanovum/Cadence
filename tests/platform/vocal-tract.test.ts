// FILE: tests/platform/vocal-tract.test.ts
//
// The TypeScript port of the VocalTract package against the package itself:
// tests/platform/fixtures/vocaltract-reference.json holds the coordinates the
// original VocalTract.sty computes for its 26 demo phonemes (regenerate with
// node scripts/vocal-tract/make-reference.mjs). TeX's fixed-point arithmetic
// prints about five decimals, hence the tolerance.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FILL_IDS,
  GERMAN_DEMO_CODEBOOK,
  HEAD_VIEW_BOX,
  LAYER_IDS,
  MAEDA_TABLE,
  NEUTRAL_PARAMS,
  buildShape,
  computeVocalTract,
  createViewport,
  fitParams,
  frontLips,
  glottisPulse,
  lerpParams,
  maedaToDrawingX,
  maedaToDrawingY,
  paramsAt,
  paramsFromVector,
  paramsToVector,
  placeAnchor,
  subpathToSvg,
  subpathsToSvg,
  type MovablePoints,
} from "../../src/lib/platform/vocal-tract/index.ts";

interface Frame {
  index: number;
  points: Record<string, [number, number]>;
  glottis: { aperture: number; frequency: number };
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/vocaltract-reference.json", import.meta.url), "utf8"),
) as { frames: Frame[] };

const TOLERANCE = 1e-4;
const paramsOf = (index: number) => paramsFromVector(GERMAN_DEMO_CODEBOOK[index - 1].vector);

describe("the port matches VocalTract.sty", () => {
  it("covers all 26 demo phonemes and every point the package computes", () => {
    assert.equal(fixture.frames.length, 26);
    assert.equal(GERMAN_DEMO_CODEBOOK.length, 26);
    assert.equal(Object.keys(fixture.frames[0].points).length, 28);
  });

  let worst = 0;
  for (const frame of fixture.frames) {
    const entry = GERMAN_DEMO_CODEBOOK[frame.index - 1];
    it(`reproduces /${entry.ipa}/ (codebook ${frame.index}, "${entry.label}")`, () => {
      const state = computeVocalTract(paramsOf(frame.index));
      for (const [name, [x, y]] of Object.entries(frame.points)) {
        const point = state.points[name as keyof MovablePoints];
        assert.ok(point, `the port has no point ${name}`);
        const error = Math.max(Math.abs(point.x - x), Math.abs(point.y - y));
        worst = Math.max(worst, error);
        assert.ok(error < TOLERANCE, `${name}: port (${point.x}, ${point.y}) vs package (${x}, ${y})`);
      }
      assert.ok(Math.abs(state.glottis.aperture - frame.glottis.aperture) < TOLERANCE, "glottal aperture");
      assert.ok(Math.abs(state.glottis.frequency - frame.glottis.frequency) < TOLERANCE, "glottal frequency");
    });
  }

  it("stays within tolerance overall", () => {
    assert.ok(worst < TOLERANCE, `worst coordinate error ${worst}`);
  });
});

describe("the package's formulas, worked by hand", () => {
  // The FigureDemo renders codebook 13, /f/: JW 2, TP 1, TS 0, TA 0, LA -1.5, LP -2.
  const f = paramsOf(13);

  it("places the tongue tip on grid line 25", () => {
    const [a1, a2, a3, a4, s, u, dx, dy, ox, oy] = MAEDA_TABLE[24];
    const v = a1 * 2 + a2 * 1 + a3 * 0 + a4 * 0;
    const distance = s * v + u;
    const x = (20 - (dx * distance + ox) - 1.0465) / 13.1774 + 1.04;
    const y = (dy * distance + oy - 1.8) / 12.3704 + 4.5;
    const tip = computeVocalTract(f).points.tongueAlveolar;
    assert.ok(Math.abs(tip.x - x) < 1e-12 && Math.abs(tip.y - y) < 1e-12);
  });

  it("moves the lower lip by lip row 3 with LA divided by three", () => {
    const r = MAEDA_TABLE[2];
    const lipB = r[17] * (r[14] * 2 + r[15] * (-1.5 / 3) + r[16] * -2) + r[18];
    const expected = maedaToDrawingY(15.18 - lipB);
    assert.ok(Math.abs(computeVocalTract(f).points.lipDownOut.y - expected) < 1e-12);
  });

  it("keeps the upper incisor-lip line fixed", () => {
    const state = computeVocalTract(f);
    assert.equal(state.points.lipUpIn.x, maedaToDrawingX(20 - 3.65));
    assert.equal(state.points.lipUpIn.y, maedaToDrawingY(15.18));
  });

  it("marks voiced and voiceless sounds the way the package draws them", () => {
    assert.equal(computeVocalTract(paramsOf(13)).glottis.voiced, false, "/f/");
    assert.equal(computeVocalTract(paramsOf(23)).glottis.voiced, true, "/v/");
  });
});

describe("parameters", () => {
  it("round-trip through the package's vector order", () => {
    const vector = [...GERMAN_DEMO_CODEBOOK[13].vector];
    assert.deepEqual(paramsToVector(paramsFromVector(vector)), vector);
  });

  it("refuses a vector of the wrong length", () => {
    assert.throws(() => paramsFromVector([1, 2, 3]));
  });
});

describe("shape and SVG paths", () => {
  const viewport = createViewport(HEAD_VIEW_BOX, 320);

  it("builds every fill and layer for every demo phoneme with finite coordinates", () => {
    for (const entry of GERMAN_DEMO_CODEBOOK) {
      const shape = buildShape(computeVocalTract(paramsFromVector(entry.vector)));
      for (const id of FILL_IDS) {
        const d = subpathToSvg(shape.fills[id], viewport);
        assert.match(d, /^M[\d.\- ]+.*Z$/, `${entry.label} fill ${id}`);
        assert.doesNotMatch(d, /NaN|Infinity/);
      }
      for (const id of LAYER_IDS) {
        const d = subpathsToSvg(shape.layers[id], viewport);
        assert.ok(d.startsWith("M"), `${entry.label} layer ${id}`);
        assert.doesNotMatch(d, /NaN|Infinity/);
      }
    }
  });

  it("maps the view box onto the viewport with y pointing down", () => {
    assert.equal(viewport.width, 320);
    assert.ok(Math.abs(viewport.height - 320 * (2.3 / 1.65)) < 1e-9);
    const topLeft = viewport.toPixels({ x: HEAD_VIEW_BOX.minX, y: HEAD_VIEW_BOX.maxY });
    assert.deepEqual(topLeft, { x: 0, y: 0 });
  });

  it("closes the lips for /p/ and opens them for /a/", () => {
    const p = frontLips(computeVocalTract(paramsOf(10)));
    const a = frontLips(computeVocalTract(paramsOf(7)));
    assert.ok(p.openness < 0.05, `p openness ${p.openness}`);
    assert.ok(a.openness > p.openness + 0.4, `a openness ${a.openness}`);
    const u = frontLips(computeVocalTract(paramsOf(8)));
    assert.ok(u.rounding > 0.4 && u.width < 1, "u is rounded and narrow");
  });

  it("anchors overlays inside the view", () => {
    const state = computeVocalTract(paramsOf(14));
    for (const place of ["bilabial", "dental", "alveolar", "velar", "glottal"] as const) {
      const { x, y } = placeAnchor(state, place);
      assert.ok(x >= HEAD_VIEW_BOX.minX && x <= HEAD_VIEW_BOX.maxX && y >= HEAD_VIEW_BOX.minY && y <= HEAD_VIEW_BOX.maxY, place);
    }
  });
});

describe("animation", () => {
  const i = paramsOf(1);
  const u = paramsOf(8);

  it("interpolates between two sounds and clamps t", () => {
    assert.deepEqual(lerpParams(i, u, 0), i);
    assert.deepEqual(lerpParams(i, u, 1), u);
    assert.deepEqual(lerpParams(i, u, 7), u);
    assert.equal(lerpParams(i, u, 0.5).tonguePosition, (i.tonguePosition + u.tonguePosition) / 2);
  });

  it("follows a diphthong trajectory", () => {
    const frames = [
      { at: 0, params: NEUTRAL_PARAMS },
      { at: 1, params: i },
    ];
    assert.deepEqual(paramsAt(frames, 0), NEUTRAL_PARAMS);
    assert.deepEqual(paramsAt(frames, 1), i);
    const mid = paramsAt(frames, 0.5).tonguePosition;
    assert.ok(Math.abs(mid - i.tonguePosition / 2) < 1e-9, "eased midpoint is halfway");
  });

  it("pulses the glottis only when voiced", () => {
    assert.equal(glottisPulse(125, false), 0);
    assert.ok(Math.abs(glottisPulse(125, true) - 1) < 1e-9);
  });
});

describe("fitting", () => {
  it("recovers the parameters of a contour the model drew itself", () => {
    const target = paramsOf(14); // /s/
    const { points } = computeVocalTract(target);
    const targets = {
      tonguePharynx: points.tonguePharynx,
      tongueUvular: points.tongueUvular,
      tongueVelar: points.tongueVelar,
      tonguePalatal: points.tonguePalatal,
      tonguePostAlveolar: points.tonguePostAlveolar,
      tongueBladeFront: points.tongueBladeFront,
      tongueAlveolar: points.tongueAlveolar,
      lipDownOut: points.lipDownOut,
      lipUpOut: points.lipUpOut,
      teethDownEdge: points.teethDownEdge,
      chordsFront: points.chordsFront,
    };
    const fit = fitParams(targets);
    assert.ok(fit.rms < 1e-6, `rms ${fit.rms}`);
    for (const key of ["jaw", "tonguePosition", "tongueShape", "tongueApex", "lipAperture", "lipProtrusion"] as const) {
      assert.ok(Math.abs(fit.params[key] - target[key]) < 1e-3, `${key}: ${fit.params[key]} vs ${target[key]}`);
    }
  });

  it("stays inside the parameter range and reports pinned parameters", () => {
    const fit = fitParams({ tongueAlveolar: { x: 2.4, y: 6.5 } });
    for (const value of Object.values(fit.params)) assert.ok(value >= -3 && value <= 3);
    assert.ok(fit.atBounds.length > 0);
  });
});

describe("articulation targets", () => {
  it("lists every English phoneme once, with GA and RP where they differ", async () => {
    const { ENGLISH_SOUNDS } = await import("../../src/lib/platform/vocal-tract/index.ts");
    const ids = ENGLISH_SOUNDS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ENGLISH_SOUNDS.filter((s) => s.kind === "consonant").length, 24);
    for (const ipa of ["θ", "ð", "ɹ", "ʃ", "ʒ", "tʃ", "dʒ"]) {
      assert.ok(ENGLISH_SOUNDS.some((s) => s.ipa.GA === ipa && s.ipa.RP === ipa), ipa);
    }
    assert.equal(ENGLISH_SOUNDS.find((s) => s.id === "sound.ow")?.ipa.RP, "əʊ");
  });

  it("validates a target and insists hand-tuned ones are flagged for review", async () => {
    const { validateArticulationTarget } = await import("../../src/lib/platform/vocal-tract/index.ts");
    const target = {
      soundId: "sound.s",
      variant: "both" as const,
      params: paramsOf(14),
      place: "alveolar" as const,
      manner: "fricative" as const,
      voicing: "voiceless" as const,
      airflow: "central" as const,
      highlight: ["tongueTip" as const, "alveolarRidge" as const],
      overlays: ["centralAirflow" as const],
      source: { method: "hand-tuned" as const, references: [] },
      needsReview: true,
    };
    assert.deepEqual(validateArticulationTarget(target), []);
    assert.ok(validateArticulationTarget({ ...target, needsReview: false }).some((p) => p.includes("needsReview")));
    const ay = { ...target, soundId: "sound.ay", params: undefined, trajectory: [{ at: 0, params: paramsOf(7) }] };
    const problems = validateArticulationTarget(ay);
    assert.ok(problems.some((p) => p.includes("two keyframes")));
    assert.ok(problems.some((p) => p.includes("vowels need")));
  });
});
