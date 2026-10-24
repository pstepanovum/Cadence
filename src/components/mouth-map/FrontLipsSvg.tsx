// FILE: src/components/mouth-map/FrontLipsSvg.tsx
//
// A simple front view of the lips from the same parameters: how open, how
// rounded, how spread.
"use client";

import { useMemo } from "react";
import { computeVocalTract, frontLips, type VocalTractParams } from "@/lib/platform/vocal-tract/index.ts";

export function FrontLipsSvg({ params, className }: { params: VocalTractParams; className?: string }) {
  const lips = useMemo(() => frontLips(computeVocalTract(params)), [params]);
  const width = 70 * lips.width;
  const open = 3 + 30 * lips.openness;
  const lipThickness = 9 + 6 * lips.rounding;
  const shape = lips.rounding > 0.4 ? "rounded" : lips.spreading > 0.3 ? "spread" : "relaxed";
  const label = `Front view: lips ${shape}, mouth ${lips.openness < 0.1 ? "closed" : lips.openness < 0.5 ? "slightly open" : "open"}.`;

  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={label} className={className} style={{ display: "block", width: "100%", height: "auto" }}>
      <rect x="0" y="0" width="200" height="120" rx="20" fill="var(--mm-bg)" />
      <ellipse cx="100" cy="60" rx={width + lipThickness} ry={open / 2 + lipThickness} fill="var(--mm-tongue)" stroke="var(--mm-tongue-line)" strokeWidth="1.5" />
      <ellipse cx="100" cy="60" rx={width} ry={open / 2} fill="#3b2422" />
      {lips.openness > 0.15 ? (
        <rect x={100 - width * 0.55} y={60 - open / 2} width={width * 1.1} height={Math.min(7, open / 3)} rx="2" fill="var(--mm-teeth)" />
      ) : null}
    </svg>
  );
}
