// FILE: src/lib/platform/vocal-tract/maeda.ts
//
// Maeda's articulatory model: seven articulatory parameters (plus glottis and
// velum) in, the movable points of the midsagittal vocal-tract contour out.
//
// Ported from the VocalTract LaTeX package (CTAN pkg/vocaltract, release 1,
// 2012) by Dimitrios Ververidis, described in D. Ververidis, D. Schneider and
// J. Koehler, "The vocal tract LaTeX package", The PracTeX Journal, 2012, no. 1.
// The factor-analysis loadings are Maeda's: S. Maeda, "Compensatory
// articulation during speech: evidence from the analysis and synthesis of
// vocal-tract shapes using an articulatory model", in W. J. Hardcastle and
// A. Marchal (eds.), Speech Production and Speech Modelling, Kluwer, 1990.
// The package README licenses it under the Apache License 2.0 and the header
// of VocalTract.sty names the LaTeX Project Public License; both permit this
// translation. This is a modified, translated version, not the original
// package. See NOTICE and CREDITS.md.
//
// Twin: mobile/src/platform/vocal-tract/maeda.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

/**
 * The ten controls of the package, in its own order (VocalTract.sty, array
 * SpeakVec, columns 1-10). Each runs from -3 to 3 with 0 as the relaxed
 * position. The first seven are Maeda's articulatory parameters; the last three
 * belong to the package's glottis and velum drawing.
 */
export interface VocalTractParams {
  /** JW. Jaw position. */
  jaw: number;
  /** TP. Tongue body position: negative is front, positive is back. */
  tonguePosition: number;
  /** TS. Tongue body shape (dorsum arching). */
  tongueShape: number;
  /** TA. Tongue apex (tip) height. */
  tongueApex: number;
  /** LA. Lip aperture: -3 closes the lips. */
  lipAperture: number;
  /** LP. Lip protrusion: positive rounds and pushes the lips forward. */
  lipProtrusion: number;
  /** LH. Larynx height. */
  larynxHeight: number;
  /** GA. Glottal aperture: -3 is wide open (voiceless), 3 is closed. */
  glottalAperture: number;
  /** FX. Glottal frequency: above -1 the folds are drawn vibrating (voiced). */
  glottalFrequency: number;
  /** NS. Velum: -3 seals the nasal port, higher values open it. */
  velum: number;
}

export type ParamKey = keyof VocalTractParams;

/** The package's column order, for converting to and from its vectors. */
export const PARAM_KEYS: readonly ParamKey[] = [
  "jaw",
  "tonguePosition",
  "tongueShape",
  "tongueApex",
  "lipAperture",
  "lipProtrusion",
  "larynxHeight",
  "glottalAperture",
  "glottalFrequency",
  "velum",
];

/** Maeda's seven articulatory parameters, the ones a contour fit can recover. */
export const ARTICULATORY_KEYS: readonly ParamKey[] = PARAM_KEYS.slice(0, 7);

export const PARAM_MIN = -3;
export const PARAM_MAX = 3;

/** The package's "Relax" row: every control at 0. */
export const NEUTRAL_PARAMS: VocalTractParams = {
  jaw: 0,
  tonguePosition: 0,
  tongueShape: 0,
  tongueApex: 0,
  lipAperture: 0,
  lipProtrusion: 0,
  larynxHeight: 0,
  glottalAperture: 0,
  glottalFrequency: 0,
  velum: 0,
};

export function paramsFromVector(vector: readonly number[]): VocalTractParams {
  if (vector.length !== PARAM_KEYS.length) {
    throw new Error(`Expected ${PARAM_KEYS.length} parameters, got ${vector.length}.`);
  }
  const params = { ...NEUTRAL_PARAMS };
  PARAM_KEYS.forEach((key, index) => {
    params[key] = vector[index];
  });
  return params;
}

export function paramsToVector(params: VocalTractParams): number[] {
  return PARAM_KEYS.map((key) => params[key]);
}

export function clampParam(value: number): number {
  return Math.min(PARAM_MAX, Math.max(PARAM_MIN, value));
}

/** A point in the package's drawing coordinates (x forward, y up). */
export interface Point {
  x: number;
  y: number;
}

/**
 * Maeda's loading table exactly as VocalTract.sty (array AMaeda) holds it: one
 * row per grid line, 19 columns. Row 1 is the package's placeholder row.
 *
 *  0-3   tongue loadings on JW, TP, TS, TA
 *  4,5   tongue scale s and offset u
 *  6,7   grid-line direction (vtos.x, vtos.y)
 *  8,9   grid-line origin (igd.x, igd.y)
 *  10,11 larynx loadings on JW, LH (rows 2-5)
 *  12,13 larynx scale and offset
 *  14-16 lip loadings on JW, LA, LP (rows 2-4)
 *  17,18 lip scale and offset
 */
export const MAEDA_TABLE: readonly (readonly number[])[] = [
  [1.0, 0.0, 0.0, 0.0, 0.293351, 1.10528, 0, 0, 0, 0, 1.0, 0.0, 0.293351, 1.10528, 1.0, 0.0, 0.0, 0.293351, 1.10528],
  [-0.464047, 0.098776, -0.25169, 0.228351, 0.317448, 4.706277, 0.980785, -0.19509, 10.634367, 5.134503, -0.208338, 0.262446, 0.440889, 1.517271, 0.178244, -0.395733, 0.888897, 0.350522, 1.301809],
  [-0.328015, 0.337579, -0.283667, 0.568234, 0.473761, 4.775106, 0.980785, -0.19509, 10.829458, 6.115289, 0.127814, 0.991798, 0.694961, -10.05123, -0.154638, 0.987971, 0.0, 1.053558, 1.440946],
  [-0.213039, 0.485565, -0.283533, 0.653696, 1.052688, 4.239388, 0.980785, -0.19509, 11.024549, 7.096074, -0.13184, 0.300784, 0.470351, 4.289589, -0.217332, 0.825187, -0.303429, 2.268359, 4.880673],
  [-0.302565, 0.705432, -0.379044, 0.392917, 1.026836, 3.695193, 0.980785, -0.19509, 11.219639, 8.076859, 0.097688, 0.934267, 0.701163, -10.207126, 0, 0, 0, 0, 0],
  [-0.327806, 0.786897, -0.388116, 0.245703, 0.891888, 3.72252, 0.980785, -0.19509, 11.414729, 9.057644, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.325065, 0.852409, -0.285125, 0.176843, 0.83059, 3.873289, 0.980785, -0.19509, 11.609819, 10.038429, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.325739, 0.904725, -0.142602, 0.138558, 0.77791, 3.925084, 0.980785, -0.19509, 11.80491, 11.019215, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.313741, 0.926339, 0.021042, 0.122976, 0.773024, 3.775744, 0.980785, -0.19509, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.288138, 0.924019, 0.131949, 0.116762, 0.757404, 3.624036, 1.0, 0.0, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.249008, 0.909585, 0.25032, 0.112433, 0.734461, 3.520446, 0.980785, 0.19509, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.196936, 0.882236, 0.369083, 0.112396, 0.706124, 3.464362, 0.92388, 0.382684, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.128884, 0.830243, 0.499894, 0.1157, 0.674199, 3.461033, 0.83147, 0.55557, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [-0.040825, 0.73052, 0.651662, 0.112048, 0.635628, 3.515299, 0.707107, 0.707107, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.07342, 0.54308, 0.807947, 0.126204, 0.600972, 3.637658, 0.55557, 0.83147, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.202726, 0.230555, 0.919065, 0.163735, 0.598, 3.829419, 0.382684, 0.92388, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.298853, -0.162541, 0.899074, 0.213884, 0.657375, 4.083451, 0.19509, 0.980785, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.332785, -0.491647, 0.748869, 0.243163, 0.776293, 4.365362, 0.0, 1.0, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.349955, -0.681313, 0.567615, 0.245295, 0.890489, 4.618332, -0.19509, 0.980785, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.377277, -0.7712, 0.410502, 0.249425, 0.969776, 4.823429, -0.382684, 0.923879, 12.0, 12.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.422713, -0.804874, 0.270513, 0.274015, 0.997716, 4.905002, -0.382684, 0.92388, 11.07612, 11.617316, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.474635, -0.797704, 0.129324, 0.314454, 1.009611, 4.802065, -0.382684, 0.92388, 10.152241, 11.234632, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.526087, -0.746938, -0.026201, 0.366149, 0.991273, 4.581855, -0.382684, 0.92388, 9.228361, 10.85195, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.549466, -0.643572, -0.190005, 0.422848, 0.985804, 4.317999, -0.382684, 0.92388, 8.304482, 10.469266, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.4942, -0.504012, -0.350434, 0.488056, 1.069908, 4.076241, -0.382683, 0.92388, 7.380602, 10.086582, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0.448797, -0.417352, -0.44541, 0.500909, 1.129032, 3.856664, -0.382684, 0.92388, 6.456723, 9.703898, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

/** A 1-based row, the way the package addresses the table. */
function row(index: number): readonly number[] {
  return MAEDA_TABLE[index - 1];
}

/** The package's linear move from Maeda's plane into its drawing (LinMov2Verver). */
export function maedaToDrawingX(x: number): number {
  return (x - 1.0465) / 13.1774 + 1.04;
}

export function maedaToDrawingY(y: number): number {
  return (y - 1.8) / 12.3704 + 4.5;
}

/** One tongue grid line (TongDepolarLinSys): the contour point on grid line `index`. */
export function tonguePoint(params: VocalTractParams, index: number): Point {
  const r = row(index);
  const v =
    r[0] * params.jaw + r[1] * params.tonguePosition + r[2] * params.tongueShape + r[3] * params.tongueApex;
  const distance = r[4] * v + r[5];
  const x = 20 - (r[6] * distance + r[8]);
  const y = r[7] * distance + r[9];
  return { x: maedaToDrawingX(x), y: maedaToDrawingY(y) };
}

/** One larynx coordinate (LrxDepolarLinSys). Rows 2 and 4 are x, rows 3 and 5 are y. */
export function larynxCoordinate(params: VocalTractParams, index: 2 | 3 | 4 | 5): number {
  const r = row(index);
  const v = r[10] * params.jaw + r[11] * params.larynxHeight;
  const value = r[12] * v + r[13];
  return index === 2 || index === 4 ? maedaToDrawingX(8 - value) : maedaToDrawingY(value + 12);
}

/** One lip measure (LipDepolarLinSys). The package passes LA/3 for row 3. */
export function lipMeasure(jaw: number, lipAperture: number, lipProtrusion: number, index: 2 | 3 | 4): number {
  const r = row(index);
  const v = r[14] * jaw + r[15] * lipAperture + r[16] * lipProtrusion;
  return r[17] * v + r[18];
}

/** Every point the parameters move, named after the package's macros. */
export interface MovablePoints {
  hyoidDown: Point;
  hyoidUp: Point;
  epiglottisBase: Point;
  tongueBase: Point;
  tonguePharynx: Point;
  epiglottis: Point;
  tongueUvular: Point;
  tongueVelar: Point;
  tonguePalatal: Point;
  tonguePostAlveolar: Point;
  /** Grid lines 23 and 24: computed by the package (vtngX, vtngY), between post-alveolar and tip. */
  tongueBladeBack: Point;
  tongueBladeFront: Point;
  tongueAlveolar: Point;
  chordsFront: Point;
  chordsBack: Point;
  lipUpOut: Point;
  lipUpIn: Point;
  lipDownOut: Point;
  lipDownIn: Point;
  chinUp: Point;
  chinMiddle: Point;
  chinDown: Point;
  lipDownBaseOut: Point;
  teethDownBaseIn: Point;
  teethDownEdge: Point;
  teethDownBaseOut: Point;
  subTongue: Point;
  /** NasalCavMov: the back of the velum, which closes against the pharynx wall. */
  velumBack: Point;
}

export interface GlottisState {
  /** Half-height of the opening ellipse in drawing units (0 to 0.025). */
  aperture: number;
  /** The package's line width for the vibrating folds, (FX + 3) / 6. */
  frequency: number;
  /** The package draws vibrating folds when FX + 3 > 2. */
  voiced: boolean;
}

export interface VocalTractState {
  params: VocalTractParams;
  points: MovablePoints;
  glottis: GlottisState;
}

/** UpdateVocalTract, without the drawing. */
export function computeVocalTract(params: VocalTractParams): VocalTractState {
  const tongue = (index: number) => tonguePoint(params, index);

  const hyoidUp = tongue(3);
  const epiglottisRaw = tongue(8);

  const lipA = lipMeasure(params.jaw, params.lipAperture, params.lipProtrusion, 2);
  const lipB = lipMeasure(params.jaw, params.lipAperture / 3, params.lipProtrusion, 3);
  const lipInX = maedaToDrawingX(20 - 3.65);
  const lipUpY = maedaToDrawingY(15.18);
  const lipOutX = maedaToDrawingX(20 - (3.65 - lipA));
  const lipDownY = maedaToDrawingY(15.18 - lipB);

  // The package first writes JW - 3 and then overwrites it with JW * 0.015;
  // only the second assignment takes effect, so that is what is kept here.
  const jawDrop = params.jaw * 0.015;

  const frequency = (params.glottalFrequency + 3) / 6;

  return {
    params,
    points: {
      hyoidDown: tongue(2),
      hyoidUp,
      epiglottisBase: { ...hyoidUp },
      tongueBase: tongue(6),
      tonguePharynx: tongue(7),
      epiglottis: { x: epiglottisRaw.x - 0.03, y: epiglottisRaw.y - 0.1 },
      tongueUvular: tongue(12),
      tongueVelar: tongue(15),
      tonguePalatal: tongue(19),
      tonguePostAlveolar: tongue(22),
      tongueBladeBack: tongue(23),
      tongueBladeFront: tongue(24),
      tongueAlveolar: tongue(25),
      chordsFront: { x: larynxCoordinate(params, 2), y: larynxCoordinate(params, 3) },
      chordsBack: { x: larynxCoordinate(params, 4), y: larynxCoordinate(params, 5) },
      lipUpOut: { x: lipOutX, y: lipUpY },
      lipUpIn: { x: lipInX, y: lipUpY },
      lipDownOut: { x: lipOutX, y: lipDownY },
      lipDownIn: { x: lipInX, y: lipDownY },
      chinUp: { x: 2.25, y: 5.3 + jawDrop },
      chinMiddle: { x: 2.325, y: 5.2 + jawDrop },
      chinDown: { x: 2.25, y: 5.1 + jawDrop },
      lipDownBaseOut: { x: 2.25, y: 5.4 + jawDrop },
      teethDownBaseIn: { x: 2.1, y: 5.4 + jawDrop },
      teethDownEdge: { x: 2.175, y: 5.5 + jawDrop },
      teethDownBaseOut: { x: 2.2, y: 5.35 + jawDrop },
      subTongue: { x: 2.025, y: 5.3 + jawDrop },
      velumBack: { x: ((params.velum + 3) / 6) * 0.15 + 1.09, y: 5.72 },
    },
    glottis: {
      aperture: ((3 - params.glottalAperture) / 6) * 0.025,
      frequency,
      voiced: params.glottalFrequency + 3 > 2,
    },
  };
}
