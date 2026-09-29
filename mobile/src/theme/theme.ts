// Design tokens mirrored from the web app (src/app/globals.css).
// Light theme only — the product has no dark mode.

export const colors = {
  hunter: "#386641",
  sage: "#6a994e",
  yellowGreen: "#a7c957",
  cream: "#f2e8cf",
  brick: "#bc4749",
  snow: "#f8f9fa",
  platinum: "#e9ecef",
  alabaster: "#dee2e6",
  paleSlate: "#ced4da",
  slate: "#6c757d",
  iron: "#495057",
  carbon: "#212529",
  white: "#ffffff",
  // Hover/one-off shades used by the web app
  hunterHover: "#44784f",
  creamHover: "#eadfbe",
  mixedChip: "#efd889",
} as const;

export const radii = {
  card: 24,
  cardLarge: 32,
  inset: 24,
  panel: 16,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fonts = {
  body: "FunnelDisplay_400Regular",
  bodyMedium: "FunnelDisplay_500Medium",
  bodySemiBold: "FunnelDisplay_600SemiBold",
  bodyBold: "FunnelDisplay_700Bold",
  kicker: "SourGummy_600SemiBold",
  kickerBold: "SourGummy_700Bold",
} as const;

export function scoreColor(score: number): string {
  if (score >= 70) return colors.yellowGreen;
  if (score >= 50) return colors.sage;
  return colors.brick;
}

// Tinted overlays used for layering on solid surfaces (no shadows/gradients).
export const overlays = {
  whiteOnGreen: "rgba(255,255,255,0.10)",
  whiteOnGreenStrong: "rgba(255,255,255,0.12)",
  sageOnCream: "rgba(106,153,78,0.15)",
  yellowGreenSoft: "rgba(167,201,87,0.20)",
  yellowGreenPanel: "rgba(167,201,87,0.30)",
  creamSoft: "rgba(242,232,207,0.80)",
} as const;
