// FILE: src/components/theme/theme.ts
//
// The person's theme choice. "system" follows prefers-color-scheme through the
// CSS alone; "light" and "dark" are written to a cookie so the server renders
// data-theme on <html> and the first paint is already right, with no inline
// script (the CSP allows none).

export const THEME_COOKIE = "cadence_theme";

export type ThemeChoice = "system" | "light" | "dark";

export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function nextThemeChoice(current: ThemeChoice): ThemeChoice {
  return current === "system" ? "light" : current === "light" ? "dark" : "system";
}
