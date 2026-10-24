// FILE: store/screenshot-studio/src/theme.ts
//
// The Cadence palette, mirrored from src/app/globals.css (and the app's
// mobile/src/theme/theme.ts), and the two Cadence typefaces copied into
// public/fonts by scripts/copy-assets.mjs.

export const palette = {
  hunter: "#386641",
  sage: "#6A994E",
  sageText: "#466C32",
  lime: "#A7C957",
  cream: "#F2E8CF",
  creamSoft: "#FBF6E9",
  brick: "#BC4749",
  snow: "#F8F9FA",
  iron: "#495057",
  carbon: "#212529",
  white: "#FFFFFF",
  night: "#1B221C",
} as const;

export const fonts = {
  text: '"Funnel Display", system-ui, sans-serif',
  kicker: '"Sour Gummy", "Funnel Display", system-ui, sans-serif',
};

export const FONT_FACES = `
@font-face { font-family: "Funnel Display"; font-weight: 500; src: url(/fonts/FunnelDisplay-500.ttf) format("truetype"); }
@font-face { font-family: "Funnel Display"; font-weight: 600; src: url(/fonts/FunnelDisplay-600.ttf) format("truetype"); }
@font-face { font-family: "Funnel Display"; font-weight: 700; src: url(/fonts/FunnelDisplay-700.ttf) format("truetype"); }
@font-face { font-family: "Sour Gummy"; font-weight: 600; src: url(/fonts/SourGummy-600.ttf) format("truetype"); }
@font-face { font-family: "Sour Gummy"; font-weight: 700; src: url(/fonts/SourGummy-700.ttf) format("truetype"); }
`;

/** The two grounds a slide can sit on. */
export type Ground = "cream" | "hunter";

export function groundColors(ground: Ground) {
  return ground === "hunter"
    ? { from: "#2E5636", base: palette.hunter, to: "#477A50", text: palette.white, muted: "rgba(255,255,255,0.78)", marker: palette.lime, kicker: palette.lime, glow: "rgba(167,201,87,0.28)" }
    : { from: palette.creamSoft, base: palette.cream, to: "#E8DAB4", text: palette.hunter, muted: palette.iron, marker: palette.lime, kicker: palette.sageText, glow: "rgba(167,201,87,0.35)" };
}

export const ILLUSTRATIONS = [
  "progress-1",
  "success-1",
  "communication-1",
  "analysing-1",
  "figuring-it-out-1",
  "daily-activity-1",
  "following-your-dreams-1",
  "getting-help-1",
  "navigating--1",
  "balancing-1",
  "overcome-problems-1",
] as const;
