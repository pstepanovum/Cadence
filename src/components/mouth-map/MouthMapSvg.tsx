// FILE: src/components/mouth-map/MouthMapSvg.tsx
//
// The side view of the mouth for one set of parameters: the VocalTract model
// (src/lib/platform/vocal-tract) turned into SVG, styled in the Cadence
// palette, with highlighted layers, overlays the model cannot show, an
// airflow arrow and a glottis that pulses when the sound is voiced. Pure
// render: the parent decides the parameters for each frame.
"use client";

import { useId, useMemo } from "react";
import {
  buildShape,
  computeVocalTract,
  createViewport,
  FILL_IDS,
  HEAD_VIEW_BOX,
  LAYER_IDS,
  placeAnchor,
  STATIC_POINTS,
  subpathsToSvg,
  subpathToSvg,
  type FillId,
  type LayerId,
  type OverlayId,
  type PlaceAnchor,
  type Point,
  type VocalTractParams,
} from "@/lib/platform/vocal-tract/index.ts";
import { LAYER_LABELS } from "@/components/mouth-map/copy";

const WIDTH = 400;

const FILL_STYLE: Record<FillId, { fill: string; stroke: string }> = {
  head: { fill: "var(--mm-tissue)", stroke: "var(--mm-tissue-line)" },
  laryngealWall: { fill: "var(--mm-tissue)", stroke: "var(--mm-tissue-line)" },
  lowerTract: { fill: "var(--mm-tissue)", stroke: "var(--mm-tissue-line)" },
  palate: { fill: "var(--mm-palate)", stroke: "var(--mm-tissue-line)" },
  tongue: { fill: "var(--mm-tongue)", stroke: "var(--mm-tongue-line)" },
  upperTeeth: { fill: "var(--mm-teeth)", stroke: "var(--mm-teeth-line)" },
  lowerTeeth: { fill: "var(--mm-teeth)", stroke: "var(--mm-teeth-line)" },
};

/** Layers that are only outlines of something already filled; drawn only when highlighted. */
const OUTLINE_ONLY = new Set<LayerId>(["face", "nasalCavity", "pharynx"]);

export interface MouthMapSvgProps {
  params: VocalTractParams;
  highlight: readonly LayerId[];
  overlays?: readonly OverlayId[];
  anchor?: PlaceAnchor;
  airflow?: "central" | "lateral" | "nasal";
  /** 0 to 1, the glottis beat for voiced sounds. */
  pulse?: number;
  /** Layer under the pointer or focus in the legend; drawn strongest. */
  focusLayer?: LayerId | null;
  title: string;
  description: string;
  className?: string;
}

export function MouthMapSvg({
  params,
  highlight,
  overlays = [],
  anchor,
  airflow,
  pulse = 0,
  focusLayer = null,
  title,
  description,
  className,
}: MouthMapSvgProps) {
  const uid = useId().replace(/:/g, "");
  const viewport = useMemo(() => createViewport(HEAD_VIEW_BOX, WIDTH), []);
  const state = useMemo(() => computeVocalTract(params), [params]);
  const shape = useMemo(() => buildShape(state), [state]);
  const px = (p: Point) => viewport.toPixels(p);
  const highlighted = new Set<LayerId>(focusLayer ? [focusLayer] : highlight);

  const glottis = shape.glottis;
  const gCenter = px(glottis.center);
  const gHalf = Math.max(4, glottis.halfWidth * viewport.scale);
  const gOpen = Math.max(0.8, glottis.aperture * viewport.scale * 1.6);

  const air = airflowPath(state, airflow, anchor, px);
  const anchorPoint = anchor ? px(placeAnchor(state, anchor)) : null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${Math.round(viewport.height)}`}
      role="img"
      aria-labelledby={`${uid}-t ${uid}-d`}
      className={className}
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <title id={`${uid}-t`}>{title}</title>
      <desc id={`${uid}-d`}>{description}</desc>
      <defs>
        <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--mm-air)" />
        </marker>
      </defs>

      <rect x="0" y="0" width={WIDTH} height={viewport.height} rx="24" fill="var(--mm-bg)" />

      {FILL_IDS.map((id) => (
        <path
          key={id}
          d={subpathToSvg(shape.fills[id], viewport)}
          fill={FILL_STYLE[id].fill}
          stroke={FILL_STYLE[id].stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      ))}

      {/* Highlight glow under the outlines. */}
      {LAYER_IDS.filter((id) => highlighted.has(id)).map((id) => (
        <path
          key={`glow-${id}`}
          d={subpathsToSvg(shape.layers[id], viewport)}
          fill="none"
          stroke="var(--mm-highlight)"
          strokeOpacity={focusLayer === id ? 0.9 : 0.65}
          strokeWidth={focusLayer === id ? 13 : 10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {LAYER_IDS.map((id) => {
        const on = highlighted.has(id);
        if (!on && OUTLINE_ONLY.has(id)) return null;
        return (
          <path
            key={id}
            d={subpathsToSvg(shape.layers[id], viewport)}
            fill="none"
            stroke={on ? "var(--mm-highlight-line)" : "transparent"}
            strokeWidth={on ? 3 : 0}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label={LAYER_LABELS[id]}
          />
        );
      })}

      {/* Vocal folds: an opening that narrows when voiced, with a beat. */}
      <g aria-label={glottis.voiced ? "Vocal folds vibrating" : "Vocal folds apart"}>
        {glottis.voiced ? (
          <circle
            cx={gCenter.x}
            cy={gCenter.y}
            r={gHalf + 4 + pulse * 8}
            fill="none"
            stroke="var(--mm-highlight)"
            strokeOpacity={0.25 + 0.5 * (1 - pulse)}
            strokeWidth={3}
          />
        ) : null}
        <ellipse cx={gCenter.x} cy={gCenter.y} rx={gHalf} ry={gOpen} fill="var(--mm-tongue-line)" />
      </g>

      {air ? (
        <path
          d={air.d}
          fill="none"
          stroke="var(--mm-air)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={air.dashed ? "2 6" : "8 4"}
          className="mm-flow"
          markerEnd={`url(#${uid}-arrow)`}
          aria-label={air.label}
        />
      ) : null}

      {anchorPoint ? <Overlays overlays={overlays} at={anchorPoint} state={state} px={px} /> : null}
    </svg>
  );
}

function Overlays({
  overlays,
  at,
  state,
  px,
}: {
  overlays: readonly OverlayId[];
  at: Point;
  state: ReturnType<typeof computeVocalTract>;
  px: (p: Point) => Point;
}) {
  return (
    <g>
      {overlays.includes("tongueTipContact") || overlays.includes("tongueBetweenTeeth") ? (
        <g aria-label={overlays.includes("tongueBetweenTeeth") ? "Tongue tip between the teeth" : "Tongue tip touches here"}>
          <circle cx={at.x} cy={at.y} r={9} fill="var(--mm-highlight)" fillOpacity={0.35} />
          <circle cx={at.x} cy={at.y} r={4.5} fill="var(--mm-highlight-line)" />
        </g>
      ) : null}
      {overlays.includes("plosiveBurst") ? (
        <g aria-label="Air builds up, then bursts out" stroke="var(--mm-air)" strokeWidth={2.4} strokeLinecap="round">
          {[-40, -15, 10, 35].map((deg) => {
            const r = (deg * Math.PI) / 180;
            const lip = px(placeAnchor(state, "lipOpening"));
            return (
              <line key={deg} x1={lip.x + 10 * Math.cos(r)} y1={lip.y + 10 * Math.sin(r)} x2={lip.x + 22 * Math.cos(r)} y2={lip.y + 22 * Math.sin(r)} />
            );
          })}
        </g>
      ) : null}
      {overlays.includes("bunchedTongue") ? (
        <g aria-label="Tongue bunched up, tip not touching">
          <circle cx={at.x - 18} cy={at.y + 14} r={6} fill="none" stroke="var(--mm-highlight-line)" strokeWidth={2} strokeDasharray="3 3" />
        </g>
      ) : null}
      {overlays.includes("glottalFriction") ? (
        <path
          aria-label="Breath through open vocal folds"
          d={`M${at.x - 14} ${at.y - 10} q 7 -6 14 0 t 14 0`}
          fill="none"
          stroke="var(--mm-air)"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      ) : null}
    </g>
  );
}

/**
 * The airflow arrow follows the airway: up the throat behind the tongue, under
 * the roof of the mouth past the place of articulation, and out of the lips;
 * or, for a nasal, up behind the velum and out of the nose.
 */
function airflowPath(
  state: ReturnType<typeof computeVocalTract>,
  airflow: MouthMapSvgProps["airflow"],
  anchor: PlaceAnchor | undefined,
  px: (p: Point) => Point,
): { d: string; dashed: boolean; label: string } | null {
  if (!airflow) return null;
  const s = STATIC_POINTS;
  const glottis = placeAnchor(state, "glottal");
  const throat: Point[] = [
    { x: glottis.x, y: glottis.y + 0.06 },
    { x: s.pharynxBackDown.x + 0.06, y: s.pharynxBackDown.y + 0.05 },
    { x: s.pharynxBackMiddle.x + 0.06, y: s.pharynxBackMiddle.y + 0.12 },
  ];
  let points: Point[];
  let label: string;
  if (airflow === "nasal") {
    points = [
      ...throat,
      { x: s.nasalPortUp.x + 0.06, y: s.nasalPortUp.y + 0.05 },
      { x: s.nasalCavBack.x + 0.1, y: s.nasalCavBack.y - 0.08 },
      { x: s.nasalCavPalatal.x, y: s.nasalCavPalatal.y + 0.17 },
      { x: s.noseBase.x + 0.12, y: s.noseBase.y + 0.08 },
    ];
    label = "Air flows out through the nose";
  } else {
    const place = anchor && anchor !== "lipOpening" && anchor !== "nasalExit" && anchor !== "glottal" ? placeAnchor(state, anchor) : s.palatal;
    const lips = placeAnchor(state, "lipOpening");
    points = [
      ...throat,
      { x: s.velar.x, y: s.velar.y - 0.08 },
      { x: place.x, y: place.y - 0.06 },
      { x: lips.x + 0.14, y: lips.y },
    ];
    label = airflow === "lateral" ? "Air flows around the sides of the tongue" : "Air flows out through the mouth";
  }
  const pixels = points.map(px);
  // Smooth corners: straight to each midpoint, curving through the corner.
  let d = `M${pixels[0].x.toFixed(1)} ${pixels[0].y.toFixed(1)}`;
  for (let i = 1; i < pixels.length - 1; i += 1) {
    const mid = { x: (pixels[i].x + pixels[i + 1].x) / 2, y: (pixels[i].y + pixels[i + 1].y) / 2 };
    d += ` Q${pixels[i].x.toFixed(1)} ${pixels[i].y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
  }
  const last = pixels[pixels.length - 1];
  d += ` L${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return { d, dashed: airflow === "lateral", label };
}
