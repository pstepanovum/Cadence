// FILE: src/lib/platform/vocal-tract/geometry.ts
//
// The static anatomy of the midsagittal drawing and the named layers built
// from it and from the movable points: fills (tissue, palate, tongue, teeth)
// and outlines (lips, teeth, alveolar ridge, hard palate, velum, tongue tip,
// blade, body and root, jaw, glottis) that a renderer strokes, fills or
// highlights. Pure data; svg-path.ts turns it into path strings.
//
// Static coordinates and drawing order follow the VocalTract LaTeX package by
// Dimitrios Ververidis (CTAN pkg/vocaltract; Ververidis, Schneider and Koehler,
// "The vocal tract LaTeX package", The PracTeX Journal, 2012, no. 1), cropped
// to the head and regrouped into layers. Apache License 2.0 per the package
// README; LPPL per the VocalTract.sty header. Modified, translated version.
// See NOTICE and CREDITS.md.
//
// Twin: mobile/src/platform/vocal-tract/geometry.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

import type { MovablePoints, Point, VocalTractState } from "./maeda.ts";

/**
 * Fixed points of the head, in the package's drawing coordinates, named after
 * its macros (VocalTract.sty, "Upper Respiration System Cords").
 */
export const STATIC_POINTS = {
  noseBase: { x: 2.325, y: 6 },
  noseEdge: { x: 2.4375, y: 6.1 },
  noseBoneUp: { x: 2.28, y: 6.37 },
  noseBoneDown: { x: 2.43, y: 6.15 },
  noseBoneIn: { x: 2.32, y: 6.2 },
  nasalCavFront: { x: 2.175, y: 6.4 },
  nasalCavCeil: { x: 1.8, y: 6.5 },
  nasalCavBack: { x: 1.35, y: 6.4 },
  nasalSphenoidUp: { x: 1.35, y: 6.3 },
  nasalSphenoidDown: { x: 1.275, y: 6.2 },
  nasalPortUp: { x: 1.07, y: 5.7 },
  nasalPortDown: { x: 1.04, y: 5.55 },
  pharynxBackUp: { x: 1.04, y: 5.43 },
  pharynxBackMiddle: { x: 1.07, y: 5.14 },
  pharynxBackDown: { x: 1.1, y: 4.81 },
  esophagusBack: { x: 0.9375, y: 4.3 },
  esophagusFront: { x: 1.0875, y: 4.3 },
  esophagusPort: { x: 1.2, y: 4.7 },
  larynxFront: { x: 1.35, y: 4.3 },
  larynxBack: { x: 1.2, y: 4.3 },
  jugularNotch: { x: 1.65, y: 4.2 },
  adamsApple: { x: 1.725, y: 4.8 },
  thyroid: { x: 1.7, y: 4.9 },
  lipUpBaseOut: { x: 2.25, y: 5.8 },
  nasalCavAlveolar: { x: 2.025, y: 6.05 },
  nasalCavPalatal: { x: 1.725, y: 6.05 },
  nasalCavVelar: { x: 1.275, y: 5.9 },
  uvular: { x: 1.31, y: 5.73 },
  velar: { x: 1.4, y: 5.75 },
  palatal: { x: 1.66, y: 5.85 },
  postPostAlveolar: { x: 1.83, y: 5.81 },
  postAlveolar: { x: 1.95, y: 5.725 },
  alveolar: { x: 2.02, y: 5.675 },
  tongueBaseFront: { x: 2, y: 5.3 },
  teethUpBaseIn: { x: 2.1, y: 5.675 },
  teethUpEdge: { x: 2.185, y: 5.57 },
  teethUpBaseOut: { x: 2.2125, y: 5.7 },
} as const satisfies Record<string, Point>;

/** The back of the head (BackToNoseEdge), from the nape to the bridge of the nose. */
const BACK_OF_HEAD: readonly Point[] = [
  { x: 0.75, y: 5 },
  { x: 0.3, y: 6.5 },
  { x: 0.75, y: 7.3 },
  { x: 1.125, y: 7.5 },
  { x: 1.875, y: 7.4 },
  { x: 2.25, y: 7 },
  { x: 2.25, y: 6.5 },
  STATIC_POINTS.noseBoneUp,
];

/** Where the drawing is cut off below the larynx; the view box hides it. */
const NECK_CUT_Y = 3.95;

/**
 * A run of points drawn either as straight segments or as a smooth curve
 * through them. `before` and `after` are neighbours outside the run that shape
 * its end tangents, so a run cut from a longer curve lines up with it exactly.
 */
export interface Run {
  points: readonly Point[];
  smooth: boolean;
  before?: Point;
  after?: Point;
}

/** Runs joined end to end; a closed subpath returns to its first point. */
export interface Subpath {
  runs: readonly Run[];
  closed: boolean;
}

export type LayerId =
  | "lips"
  | "teeth"
  | "alveolarRidge"
  | "hardPalate"
  | "velum"
  | "tongueTip"
  | "tongueBlade"
  | "tongueBody"
  | "tongueRoot"
  | "jaw"
  | "glottis"
  | "pharynx"
  | "nasalCavity"
  | "face";

/** Every layer a renderer can highlight, front of the mouth first. */
export const LAYER_IDS: readonly LayerId[] = [
  "lips",
  "teeth",
  "alveolarRidge",
  "hardPalate",
  "velum",
  "tongueTip",
  "tongueBlade",
  "tongueBody",
  "tongueRoot",
  "jaw",
  "glottis",
  "pharynx",
  "nasalCavity",
  "face",
];

export type FillId = "head" | "laryngealWall" | "lowerTract" | "palate" | "tongue" | "upperTeeth" | "lowerTeeth";

/** Fills in painting order: soft tissue first, then tongue, then teeth on top. */
export const FILL_IDS: readonly FillId[] = [
  "head",
  "laryngealWall",
  "lowerTract",
  "palate",
  "tongue",
  "upperTeeth",
  "lowerTeeth",
];

export interface GlottisShape {
  /** Centre of the vocal folds, drawing coordinates. */
  center: Point;
  /** Half the distance between the fold joints. */
  halfWidth: number;
  /** Half-height of the opening; 0 is closed. */
  aperture: number;
  /** The fold joints themselves, for drawing the folds as a line. */
  back: Point;
  front: Point;
  voiced: boolean;
}

export interface VocalTractShape {
  fills: Record<FillId, Subpath>;
  layers: Record<LayerId, Subpath[]>;
  glottis: GlottisShape;
}

const line = (...points: Point[]): Run => ({ points, smooth: false });
const curve = (points: Point[], before?: Point, after?: Point): Run => ({ points, smooth: true, before, after });

/** The tongue's upper contour from the root to the front of the floor of the mouth. */
export function tongueContour(m: MovablePoints): Point[] {
  return [
    m.tonguePharynx,
    m.tongueUvular,
    m.tongueVelar,
    m.tonguePalatal,
    m.tonguePostAlveolar,
    m.tongueBladeBack,
    m.tongueBladeFront,
    m.tongueAlveolar,
    STATIC_POINTS.tongueBaseFront,
  ];
}

/** The roof of the mouth from the back of the velum to the alveolar ridge. */
export function oralRoof(m: MovablePoints): Point[] {
  const s = STATIC_POINTS;
  return [s.nasalCavVelar, m.velumBack, s.uvular, s.velar, s.palatal, s.postPostAlveolar, s.postAlveolar, s.alveolar];
}

/** A piece of a smooth curve, from index `from` to `to`, keeping the curve's tangents. */
function slice(points: readonly Point[], from: number, to: number): Run {
  return curve(points.slice(from, to + 1), points[from - 1], points[to + 1]);
}

export function buildShape(state: VocalTractState): VocalTractShape {
  const s = STATIC_POINTS;
  const m = state.points;
  const tongue = tongueContour(m);
  const roof = oralRoof(m);
  const nasalWall = [
    s.noseBoneDown,
    s.noseBoneIn,
    s.nasalCavFront,
    s.nasalCavCeil,
    s.nasalCavBack,
    s.nasalSphenoidUp,
    s.nasalSphenoidDown,
    s.nasalPortUp,
    s.nasalPortDown,
    s.pharynxBackUp,
  ];
  const epiglottis = [m.chordsFront, m.hyoidDown, m.hyoidUp, m.epiglottisBase, m.epiglottis, m.tongueBase];
  const upperLip = [s.teethUpBaseOut, m.lipUpIn, m.lipUpOut, s.lipUpBaseOut, s.noseBase];
  const lowerLip = [m.teethDownBaseOut, m.lipDownIn, m.lipDownOut];
  const chin = [m.lipDownOut, m.chinUp, m.chinMiddle, m.chinDown, s.thyroid, s.adamsApple, s.jugularNotch];

  const fills: Record<FillId, Subpath> = {
    // Behind the pharynx and esophagus: nape, skull, nasal cavity wall, pharynx wall.
    head: {
      closed: true,
      runs: [
        line({ x: 0.5, y: NECK_CUT_Y }, BACK_OF_HEAD[0]),
        curve([...BACK_OF_HEAD]),
        curve([s.noseBoneUp, s.noseBoneDown]),
        curve(nasalWall),
        line(s.pharynxBackUp, s.pharynxBackMiddle, s.pharynxBackDown, s.esophagusBack, {
          x: s.esophagusBack.x,
          y: NECK_CUT_Y,
        }),
      ],
    },
    // Between the esophagus and the trachea, up to the back of the vocal folds.
    laryngealWall: {
      closed: true,
      runs: [
        line(
          { x: s.esophagusFront.x, y: NECK_CUT_Y },
          s.esophagusFront,
          s.esophagusPort,
          m.chordsBack,
          s.larynxBack,
          { x: s.larynxBack.x, y: NECK_CUT_Y },
        ),
      ],
    },
    // In front of the airway: larynx front, epiglottis, tongue, lower teeth, lip, chin, neck.
    lowerTract: {
      closed: true,
      runs: [
        line({ x: s.larynxFront.x, y: NECK_CUT_Y }, s.larynxFront, m.chordsFront),
        curve(epiglottis),
        line(m.tongueBase, m.tonguePharynx),
        curve(tongue),
        line(s.tongueBaseFront, m.subTongue, m.teethDownBaseIn, m.teethDownEdge, m.teethDownBaseOut),
        curve(lowerLip),
        curve(chin),
        line(s.jugularNotch, { x: s.jugularNotch.x, y: NECK_CUT_Y }),
      ],
    },
    // The upper jaw between the nasal floor and the roof of the mouth (OralNasalBorder).
    palate: {
      closed: true,
      runs: [
        curve([s.noseBase, s.nasalCavAlveolar, s.nasalCavPalatal, s.nasalCavVelar]),
        curve(roof),
        line(s.alveolar, s.teethUpBaseIn, s.teethUpEdge, s.teethUpBaseOut),
        curve(upperLip),
      ],
    },
    // The tongue as one body, so it can be tinted on its own.
    tongue: {
      closed: true,
      runs: [curve(tongue), line(s.tongueBaseFront, m.subTongue, m.hyoidUp, m.tongueBase, m.tonguePharynx)],
    },
    upperTeeth: { closed: true, runs: [line(s.teethUpBaseIn, s.teethUpEdge, s.teethUpBaseOut)] },
    lowerTeeth: { closed: true, runs: [line(m.teethDownBaseIn, m.teethDownEdge, m.teethDownBaseOut)] },
  };

  const open = (...runs: Run[]): Subpath => ({ runs, closed: false });

  const layers: Record<LayerId, Subpath[]> = {
    lips: [open(slice(upperLip, 0, 3)), open(curve(lowerLip, undefined, m.chinUp))],
    teeth: [fills.upperTeeth, fills.lowerTeeth],
    alveolarRidge: [open(slice(roof, 5, 7), line(s.alveolar, s.teethUpBaseIn))],
    hardPalate: [open(slice(roof, 3, 5))],
    velum: [open(slice(roof, 0, 3))],
    tongueRoot: [open(line(m.tongueBase, m.tonguePharynx), slice(tongue, 0, 1))],
    tongueBody: [open(slice(tongue, 1, 3))],
    tongueBlade: [open(slice(tongue, 3, 5))],
    tongueTip: [open(slice(tongue, 5, 8))],
    jaw: [
      open(line(m.subTongue, m.teethDownBaseIn, m.teethDownEdge, m.teethDownBaseOut)),
      open(slice(chin, 1, 4)),
    ],
    glottis: [open(line(m.chordsBack, m.chordsFront))],
    pharynx: [open(line(s.pharynxBackUp, s.pharynxBackMiddle, s.pharynxBackDown)), open(curve(epiglottis))],
    nasalCavity: [
      open(curve(nasalWall.slice(0, 9))),
      open(curve([s.noseBase, s.nasalCavAlveolar, s.nasalCavPalatal, s.nasalCavVelar])),
    ],
    face: [
      open(curve([s.noseBoneUp, s.noseBoneDown]), curve([s.noseBoneDown, s.noseEdge, s.noseBase, s.lipUpBaseOut])),
      open(slice(chin, 0, 6)),
    ],
  };

  const back = m.chordsBack;
  const front = m.chordsFront;
  return {
    fills,
    layers,
    glottis: {
      center: { x: (back.x + front.x) / 2, y: (back.y + front.y) / 2 },
      halfWidth: (front.x - back.x) / 2,
      aperture: state.glottis.aperture,
      back,
      front,
      voiced: state.glottis.voiced,
    },
  };
}

/** Places of articulation an overlay (contact dot, airflow arrow) can anchor to. */
export type PlaceAnchor =
  | "bilabial"
  | "labiodental"
  | "dental"
  | "alveolar"
  | "postalveolar"
  | "palatal"
  | "velar"
  | "uvular"
  | "glottal"
  | "lipOpening"
  | "nasalExit";

export function placeAnchor(state: VocalTractState, place: PlaceAnchor): Point {
  const s = STATIC_POINTS;
  const m = state.points;
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  switch (place) {
    case "bilabial":
    case "lipOpening":
      return mid(m.lipUpOut, m.lipDownOut);
    case "labiodental":
      return mid(s.teethUpEdge, m.lipDownIn);
    case "dental":
      return s.teethUpEdge;
    case "alveolar":
      return s.alveolar;
    case "postalveolar":
      return s.postAlveolar;
    case "palatal":
      return s.palatal;
    case "velar":
      return s.velar;
    case "uvular":
      return s.uvular;
    case "glottal":
      return mid(m.chordsBack, m.chordsFront);
    case "nasalExit":
      return mid(s.noseEdge, s.noseBase);
  }
}

/** The area a mouth map shows: the oral and nasal cavities, pharynx and larynx. */
export const HEAD_VIEW_BOX = { minX: 0.9, maxX: 2.55, minY: 4.3, maxY: 6.6 } as const;

/**
 * The front view of the lips. The package draws only the side view, so this is
 * Cadence's own simple reading of the same parameters: openness from the gap
 * between the lips, rounding and spreading from lip protrusion. Each is 0 to 1.
 */
export interface FrontLips {
  openness: number;
  rounding: number;
  spreading: number;
  /** Mouth width relative to a relaxed mouth (1). */
  width: number;
}

const LIP_GAP_CLOSED = 0.032;
const LIP_GAP_RANGE = 0.17;

export function frontLips(state: VocalTractState): FrontLips {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const gap = state.points.lipUpOut.y - state.points.lipDownOut.y;
  const protrusion = state.params.lipProtrusion;
  const rounding = clamp01(protrusion / 3);
  const spreading = clamp01(-protrusion / 3);
  return {
    openness: clamp01((gap - LIP_GAP_CLOSED) / LIP_GAP_RANGE),
    rounding,
    spreading,
    width: 1 + 0.15 * spreading - 0.4 * rounding,
  };
}
