// The mouth map's colours: soft fills, clear outlines, highlights in the
// Cadence brand colours, in light and dark.
import type { FillId } from "@/platform/vocal-tract";

export interface MouthPalette {
  background: string;
  fills: Record<FillId, string>;
  outline: string;
  faint: string;
  /** The first highlighted layer. */
  primary: string;
  /** Other highlighted layers. */
  secondary: string;
  /** Tinted tongue when a tongue layer is highlighted. */
  tongueActive: string;
  air: string;
  voice: string;
  compare: string;
  lip: string;
  lipInner: string;
  teethFront: string;
}

export const LIGHT_MOUTH: MouthPalette = {
  background: "#f8f9fa",
  fills: {
    head: "#efe5cc",
    laryngealWall: "#e8dbbc",
    lowerTract: "#f2e8cf",
    palate: "#e4d3ae",
    tongue: "#e9b9b4",
    upperTeeth: "#ffffff",
    lowerTeeth: "#ffffff",
  },
  outline: "#6f6450",
  faint: "#b7aa8c",
  primary: "#bc4749",
  secondary: "#386641",
  tongueActive: "#dd8f8a",
  air: "#6a994e",
  voice: "#a7c957",
  compare: "#386641",
  lip: "#d98f8b",
  lipInner: "#5b2b2c",
  teethFront: "#ffffff",
};

export const DARK_MOUTH: MouthPalette = {
  background: "#1d2420",
  fills: {
    head: "#2c3830",
    laryngealWall: "#34433a",
    lowerTract: "#2f3b33",
    palate: "#3d4c41",
    tongue: "#8f5355",
    upperTeeth: "#ece7dc",
    lowerTeeth: "#ece7dc",
  },
  outline: "#cfc6b0",
  faint: "#6f7a70",
  primary: "#ef8a8b",
  secondary: "#a7c957",
  tongueActive: "#b9686a",
  air: "#a7c957",
  voice: "#d4e7a6",
  compare: "#d4e7a6",
  lip: "#b9686a",
  lipInner: "#140c0c",
  teethFront: "#ece7dc",
};
