// The front view of the lips: how open, how rounded or spread, from the same
// parameters as the side view (frontLips in the shared model), plus the
// teeth, a tongue tip between them for TH, and side arrows for L.
import { useMemo } from "react";
import Svg, { Ellipse, G, Path, Rect } from "react-native-svg";

import { computeVocalTract, frontLips, type OverlayId, type VocalTractParams } from "@/platform/vocal-tract";

import type { MouthPalette } from "./palette";

export function FrontLipsView({
  params,
  width,
  palette,
  overlays = [],
  accessibilityLabel,
}: {
  params: VocalTractParams;
  width: number;
  palette: MouthPalette;
  overlays?: readonly OverlayId[];
  accessibilityLabel: string;
}) {
  const lips = useMemo(() => frontLips(computeVocalTract(params)), [params]);
  const height = width * 0.62;
  const cx = width / 2;
  const cy = height / 2;

  const mouthW = width * 0.62 * lips.width;
  const lipThickness = height * (0.13 + 0.07 * lips.rounding);
  const openingH = Math.max(1.5, height * (0.04 + 0.3 * lips.openness + 0.08 * lips.rounding * (lips.openness > 0.05 ? 1 : 0)));
  const openingW = mouthW * (0.78 - 0.4 * lips.rounding);
  const outerH = openingH + lipThickness * 2;
  const closed = lips.openness < 0.04 && lips.rounding < 0.3;
  const showTeeth = !closed && lips.rounding < 0.5 && openingH > height * 0.06;
  const stroke = Math.max(1.2, width / 120);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Rect x={0} y={0} width={width} height={height} rx={14} fill={palette.fills.lowerTract} />
      <Ellipse cx={cx} cy={cy} rx={mouthW / 2} ry={outerH / 2} fill={palette.lip} stroke={palette.outline} strokeWidth={stroke} />
      {closed ? (
        <Path d={`M${cx - mouthW / 2 + 4} ${cy} Q${cx} ${cy + 3} ${cx + mouthW / 2 - 4} ${cy}`} stroke={palette.lipInner} strokeWidth={stroke * 1.4} fill="none" />
      ) : (
        <G>
          <Ellipse cx={cx} cy={cy} rx={openingW / 2} ry={openingH / 2} fill={palette.lipInner} />
          {showTeeth ? (
            <Rect x={cx - openingW * 0.32} y={cy - openingH / 2} width={openingW * 0.64} height={Math.min(openingH * 0.38, height * 0.08)} rx={3} fill={palette.teethFront} />
          ) : null}
          {overlays.includes("tongueBetweenTeeth") ? (
            <Ellipse cx={cx} cy={cy + openingH * 0.1} rx={openingW * 0.22} ry={Math.max(3, openingH * 0.3)} fill={palette.fills.tongue} />
          ) : null}
        </G>
      )}
      {overlays.includes("lateralAirflow") ? (
        <G stroke={palette.air} strokeWidth={stroke * 1.4} strokeLinecap="round" fill="none">
          <Path d={`M${cx - mouthW / 2 - 4} ${cy} l-12 0 m0 0 l5 -4 m-5 4 l5 4`} />
          <Path d={`M${cx + mouthW / 2 + 4} ${cy} l12 0 m0 0 l-5 -4 m5 4 l-5 4`} />
        </G>
      ) : null}
    </Svg>
  );
}
