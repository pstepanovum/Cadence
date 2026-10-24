
export const APP_MODE_COOKIE = "cadence_app_mode";

export type AppMode = "local" | "cloud";

const APP_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseAppMode(value: string | null | undefined): AppMode | null {
  if (value === "local" || value === "cloud") {
    return value;
  }

  return null;
}

export function getAppModeCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: APP_MODE_COOKIE_MAX_AGE,
  };
}
