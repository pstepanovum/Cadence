// One frame of the side view (midsagittal section): soft fills, outlines,
// highlighted articulators, the voice box pulsing for voiced sounds, an
// airflow arrow and the overlays the model cannot show on its own. Drawn from
// the shared VocalTract port, so the web draws the same shape.
import { useEffect, useMemo } from "react";
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Line, Path } from "react-native-svg";

import {
  buildShape,
  computeVocalTract,
  createViewport,
  FILL_IDS,
  HEAD_VIEW_BOX,
  LAYER_IDS,
  placeAnchor,
  subpathsToSvg,
  subpathToSvg,
  type LayerId,
  type OverlayId,
  type PlaceAnchor,
  type Point,
  type VocalTractParams,
} from "@/platform/vocal-tract";

import type { MouthPalette } from "./palette";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const TONGUE_LAYERS: readonly LayerId[] = ["tongueTip", "tongueBlade", "tongueBody", "tongueRoot"];

export interface VocalTractViewProps {
  params: VocalTractParams;
  width: number;
  palette: MouthPalette;
  highlight?: readonly LayerId[];
  overlays?: readonly OverlayId[];
  anchor?: PlaceAnchor;
  airflow?: "central" | "lateral" | "nasal" | null;
  voiced?: boolean;
  /** A second shape drawn as a dashed outline, for the compare view. */
  ghost?: VocalTractParams | null;
  accessibilityLabel: string;
}

function airflowPath(
  airflow: "central" | "lateral" | "nasal",
  state: ReturnType<typeof computeVocalTract>,
  anchor: PlaceAnchor | undefined,
): Point[] {
  const lips = placeAnchor(state, "lipOpening");
  if (airflow === "nasal") {
    const nose = placeAnchor(state, "nasalExit");
    return [
      { x: 1.2, y: 5.78 },
      { x: 1.6, y: 6.12 },
      { x: 2.1, y: 6.18 },
      { x: nose.x + 0.05, y: nose.y - 0.02 },
      { x: nose.x + 0.18, y: nose.y - 0.06 },
    ];
  }
  const start = anchor && anchor !== "lipOpening" && anchor !== "nasalExit" ? placeAnchor(state, anchor) : { x: 1.6, y: 5.6 };
  const from = { x: start.x - 0.06, y: start.y - 0.08 };
  return [from, { x: (from.x + lips.x) / 2, y: (from.y + lips.y) / 2 + 0.02 }, lips, { x: lips.x + 0.2, y: lips.y }];
}

function polyline(points: readonly Point[], toPixels: (p: Point) => Point): string {
  return points
    .map(toPixels)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

export function VocalTractView({
  params,
  width,
  palette,
  highlight = [],
  overlays = [],
  anchor,
  airflow = null,
  voiced = false,
  ghost = null,
  accessibilityLabel,
}: VocalTractViewProps) {
  const viewport = useMemo(() => createViewport(HEAD_VIEW_BOX, width), [width]);
  const state = useMemo(() => computeVocalTract(params), [params]);
  const shape = useMemo(() => buildShape(state), [state]);
  const ghostTongue = useMemo(() => {
    if (!ghost) return null;
    const g = buildShape(computeVocalTract(ghost));
    return { tongue: subpathToSvg(g.fills.tongue, viewport), lips: subpathsToSvg(g.layers.lips, viewport) };
  }, [ghost, viewport]);

  const stroke = Math.max(1.2, width / 260);
  const tongueLit = highlight.some((id) => TONGUE_LAYERS.includes(id));

  // Voice: a soft halo at the vocal folds that beats while the sound is voiced.
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!voiced || reduceMotion) {
      pulse.value = voiced ? 0.6 : 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [voiced, reduceMotion, pulse]);
  const glottisCenter = viewport.toPixels(shape.glottis.center);
  const haloRadius = Math.max(6, (shape.glottis.halfWidth + 0.03) * viewport.scale);
  const haloProps = useAnimatedProps(() => ({
    opacity: 0.15 + 0.55 * pulse.value,
    r: haloRadius * (0.85 + 0.3 * pulse.value),
  }));

  // Air: a dashed arrow whose dashes travel outwards.
  const dash = useSharedValue(0);
  useEffect(() => {
    if (!airflow || reduceMotion) {
      dash.value = 0;
      return;
    }
    dash.value = 0;
    dash.value = withRepeat(withTiming(-24, { duration: 900, easing: Easing.linear }), -1, false);
  }, [airflow, reduceMotion, dash]);
  const dashProps = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));

  const arrow = airflow ? airflowPath(airflow, state, anchor) : null;
  const arrowD = arrow ? polyline(arrow, viewport.toPixels) : null;
  const tip = arrow ? viewport.toPixels(arrow[arrow.length - 1]) : null;
  const beforeTip = arrow ? viewport.toPixels(arrow[arrow.length - 2]) : null;
  const angle = tip && beforeTip ? Math.atan2(tip.y - beforeTip.y, tip.x - beforeTip.x) : 0;
  const head = 7 * (width / 320);

  const anchorPoint = anchor ? viewport.toPixels(placeAnchor(state, anchor)) : null;
  const dental = viewport.toPixels(placeAnchor(state, "dental"));

  return (
    <Svg
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      {FILL_IDS.map((id) => (
        <Path
          key={id}
          d={subpathToSvg(shape.fills[id], viewport)}
          fill={id === "tongue" && tongueLit ? palette.tongueActive : palette.fills[id]}
          stroke={palette.faint}
          strokeWidth={id === "upperTeeth" || id === "lowerTeeth" ? stroke : stroke * 0.6}
          strokeLinejoin="round"
        />
      ))}

      {LAYER_IDS.filter((id) => !highlight.includes(id) && id !== "face").map((id) => (
        <Path
          key={id}
          d={subpathsToSvg(shape.layers[id], viewport)}
          fill="none"
          stroke={palette.outline}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <Path d={subpathsToSvg(shape.layers.face, viewport)} fill="none" stroke={palette.faint} strokeWidth={stroke} strokeLinecap="round" />

      {ghostTongue ? (
        <G opacity={0.9}>
          <Path d={ghostTongue.tongue} fill="none" stroke={palette.compare} strokeWidth={stroke * 1.6} strokeDasharray="6 5" />
          <Path d={ghostTongue.lips} fill="none" stroke={palette.compare} strokeWidth={stroke * 1.6} strokeDasharray="6 5" />
        </G>
      ) : null}

      {highlight.map((id, index) => (
        <Path
          key={`hl-${id}`}
          d={subpathsToSvg(shape.layers[id], viewport)}
          fill={id === "teeth" ? palette.teethFront : "none"}
          stroke={index === 0 ? palette.primary : palette.secondary}
          strokeWidth={stroke * (index === 0 ? 3 : 2.4)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {voiced ? <AnimatedCircle cx={glottisCenter.x} cy={glottisCenter.y} fill={palette.voice} animatedProps={haloProps} /> : null}
      <Line
        x1={viewport.toPixels(shape.glottis.back).x}
        y1={viewport.toPixels(shape.glottis.back).y}
        x2={viewport.toPixels(shape.glottis.front).x}
        y2={viewport.toPixels(shape.glottis.front).y}
        stroke={highlight.includes("glottis") ? palette.primary : palette.outline}
        strokeWidth={stroke * 2}
        strokeLinecap="round"
      />

      {arrowD && tip ? (
        <G>
          <AnimatedPath
            d={arrowD}
            fill="none"
            stroke={palette.air}
            strokeWidth={stroke * 2}
            strokeDasharray="8 4"
            strokeLinecap="round"
            animatedProps={dashProps}
          />
          <Path
            d={`M${tip.x} ${tip.y} L${tip.x - head * Math.cos(angle - 0.5)} ${tip.y - head * Math.sin(angle - 0.5)} M${tip.x} ${tip.y} L${
              tip.x - head * Math.cos(angle + 0.5)
            } ${tip.y - head * Math.sin(angle + 0.5)}`}
            stroke={palette.air}
            strokeWidth={stroke * 2}
            strokeLinecap="round"
          />
        </G>
      ) : null}

      {overlays.includes("tongueTipContact") && anchorPoint ? (
        <Circle cx={anchorPoint.x} cy={anchorPoint.y} r={stroke * 3.2} fill={palette.primary} />
      ) : null}
      {overlays.includes("tongueBetweenTeeth") ? <Circle cx={dental.x} cy={dental.y} r={stroke * 3.2} fill={palette.primary} /> : null}
      {overlays.includes("plosiveBurst") && anchorPoint ? (
        <G stroke={palette.primary} strokeWidth={stroke * 1.4} strokeLinecap="round">
          {[-0.7, 0, 0.7].map((a) => (
            <Line
              key={a}
              x1={anchorPoint.x + 6 * Math.cos(a)}
              y1={anchorPoint.y + 6 * Math.sin(a)}
              x2={anchorPoint.x + 13 * Math.cos(a)}
              y2={anchorPoint.y + 13 * Math.sin(a)}
            />
          ))}
        </G>
      ) : null}
      {overlays.includes("bunchedTongue") ? (
        <Circle
          cx={viewport.toPixels(state.points.tongueVelar).x}
          cy={viewport.toPixels(state.points.tongueVelar).y}
          r={stroke * 3}
          fill="none"
          stroke={palette.primary}
          strokeWidth={stroke * 1.4}
        />
      ) : null}
      {overlays.includes("glottalFriction") ? (
        <Path
          d={`M${glottisCenter.x - 10} ${glottisCenter.y - 10} q5 -5 10 0 t10 0`}
          stroke={palette.air}
          strokeWidth={stroke * 1.4}
          fill="none"
        />
      ) : null}
    </Svg>
  );
}
