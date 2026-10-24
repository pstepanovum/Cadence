// Design tokens mirrored from the web app (src/app/globals.css), in light and
// dark.
//
// The colour tokens are live: `colors`, `overlays` and `shadows` hold the
// current scheme's values, swapped by `applyColorScheme`, and style sheets
// built with `themed()` are rebuilt on first use after a swap. The root layout
// applies the system scheme and remounts the app when it changes, so every
// screen redraws with the new values.

const lightColors = {
  hunter: "#386641",
  sage: "#6a994e",
  yellowGreen: "#a7c957",
  cream: "#f2e8cf",
  brick: "#bc4749",
  snow: "#f8f9fa",
  platinum: "#e9ecef",
  alabaster: "#dee2e6",
  paleSlate: "#ced4da",
  /** Muted text. One step darker than the web's #6c757d so 12pt meta text passes AA on snow. */
  slate: "#5c646b",
  iron: "#495057",
  carbon: "#212529",
  white: "#ffffff",
  mixedChip: "#efd889",

  // Text-safe shades of the brand colours. Each one clears WCAG AA (4.5:1) on
  // the surface it is meant for, so small labels never fall back to a colour
  // that only works at headline size.
  /** Sage for text on cream, snow or white (4.5:1 on cream). */
  sageText: "#4a7335",
  /** Deep hunter for text on yellow-green and the mixed chip (5.3:1). */
  ink: "#244a2c",
  /** Brick for text on light surfaces and the soft error tint. */
  brickText: "#9e3a3c",
  /** Yellow-green lifted for text on hunter (5:1). */
  lime: "#d4e7a6",
  /** Secondary text on hunter. */
  onDarkMuted: "rgba(248,249,250,0.82)",

  // Soft tints for banners and selected surfaces.
  limeSoft: "#e3eec8",
  brickSoft: "#f6e3e3",
  mixedSoft: "#f7ecc3",
};

export type Palette = { [K in keyof typeof lightColors]: string };

/**
 * Dark mode keeps the names and their roles: `cream` is still the page,
 * `snow` the card, `hunter` the strong brand colour (lifted to stay readable
 * on dark), `iron` body text. Text-safe shades are re-picked for AA on the
 * dark surfaces.
 */
const darkColors: Palette = {
  hunter: "#a7c957",
  sage: "#8fbf6a",
  yellowGreen: "#a7c957",
  cream: "#16191c",
  brick: "#d9686a",
  snow: "#212529",
  platinum: "#2b3035",
  alabaster: "#343a40",
  paleSlate: "#495057",
  slate: "#adb5bd",
  iron: "#dee2e6",
  carbon: "#f8f9fa",
  white: "#2b3035",
  mixedChip: "#e6cf7f",
  sageText: "#a9d18c",
  ink: "#1b3a22",
  brickText: "#f2a7a8",
  lime: "#1b3a22",
  onDarkMuted: "rgba(22,25,28,0.78)",
  limeSoft: "#26371f",
  brickSoft: "#3b2425",
  mixedSoft: "#3a3420",
};

export const colors: Palette = { ...lightColors };

export const radii = {
  /** Lists, cards, banners. */
  card: 20,
  /** Hero cards, the flashcard, empty states. */
  cardLarge: 28,
  /** Buttons, text fields, option tiles: soft, not pills. */
  control: 14,
  /** Panels nested inside a card. */
  panel: 16,
  /** Letter tiles, phoneme cards. */
  tile: 12,
  /** Tags and round icon buttons only. */
  pill: 999,
} as const;

/** A 4/8pt scale. Nothing in the app should need a value between these. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const fonts = {
  body: "FunnelDisplay_400Regular",
  bodyMedium: "FunnelDisplay_500Medium",
  bodySemiBold: "FunnelDisplay_600SemiBold",
  bodyBold: "FunnelDisplay_700Bold",
  kicker: "SourGummy_600SemiBold",
  kickerBold: "SourGummy_700Bold",
} as const;

/**
 * The type scale, in points. Screens pick from these instead of inventing a
 * size, and nothing a learner needs to read goes below `caption`.
 */
export const type = {
  display: 32,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 15,
  callout: 14,
  footnote: 13,
  caption: 12,
} as const;

/**
 * Dynamic Type ceilings. Text keeps growing with the system setting, but stops
 * where a phone-width layout would start to clip: headings and numbers stop
 * early, running text goes furthest.
 */
export const maxScale = {
  title: 1.35,
  body: 1.75,
  control: 1.5,
  label: 1.4,
} as const;

/** Gentle elevation: enough to lift a card off cream, never a hard drop shadow. */
const lightShadows = {
  card: "0px 2px 10px rgba(33, 37, 41, 0.06)",
  raised: "0px 6px 18px rgba(33, 37, 41, 0.14)",
};

/** Minimum size of anything tappable (Apple HIG). */
export const TAP_TARGET = 44;

export function scoreColor(score: number): string {
  if (score >= 70) return colors.yellowGreen;
  if (score >= 50) return colors.sage;
  return colors.brick;
}

// Tinted overlays used for layering on solid surfaces.
const lightOverlays = {
  whiteOnGreen: "rgba(255,255,255,0.10)",
  whiteOnGreenStrong: "rgba(255,255,255,0.14)",
  yellowGreenPanel: "rgba(167,201,87,0.30)",
  creamSoft: "rgba(242,232,207,0.80)",
  /** The tonal button and pressed rows: hunter at a whisper. */
  hunterTint: "rgba(56,102,65,0.08)",
  /** Locked or unavailable cards — one token instead of a copied rgba. */
  locked: "rgba(233,236,239,0.7)",
  /** The recorder halo. */
  brickHalo: "rgba(188,71,73,0.22)",
};

const darkOverlays: typeof lightOverlays = {
  whiteOnGreen: "rgba(20,28,23,0.10)",
  whiteOnGreenStrong: "rgba(20,28,23,0.16)",
  yellowGreenPanel: "rgba(167,201,87,0.22)",
  creamSoft: "rgba(20,28,23,0.80)",
  hunterTint: "rgba(167,201,87,0.12)",
  locked: "rgba(42,54,47,0.7)",
  brickHalo: "rgba(217,104,106,0.28)",
};

const darkShadows: typeof lightShadows = {
  card: "0px 1px 2px rgba(0, 0, 0, 0.35)",
  raised: "0px 6px 18px rgba(0, 0, 0, 0.45)",
};

export const overlays: { [K in keyof typeof lightOverlays]: string } = { ...lightOverlays };
export const shadows: { [K in keyof typeof lightShadows]: string } = { ...lightShadows };

export type ColorScheme = "light" | "dark";

let scheme: ColorScheme = "light";
let version = 0;

export function currentScheme(): ColorScheme {
  return scheme;
}

/** Swaps the live tokens. Returns true when the scheme actually changed. */
export function applyColorScheme(next: ColorScheme): boolean {
  if (next === scheme) return false;
  scheme = next;
  version += 1;
  Object.assign(colors, next === "dark" ? darkColors : lightColors);
  Object.assign(overlays, next === "dark" ? darkOverlays : lightOverlays);
  Object.assign(shadows, next === "dark" ? darkShadows : lightShadows);
  return true;
}

/**
 * A value built from the tokens (a style sheet, a palette) that is rebuilt
 * after the scheme changes. Behaves like the object itself, including for
 * spreading and key listing.
 */
export function themed<T extends object>(build: () => T): T {
  let built = build();
  let builtFor = version;
  const current = () => {
    if (builtFor !== version) {
      built = build();
      builtFor = version;
    }
    return built;
  };
  return new Proxy({} as T, {
    get: (_, key) => Reflect.get(current(), key),
    has: (_, key) => Reflect.has(current(), key),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
