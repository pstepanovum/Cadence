// FILE: src/lib/auth/route-gate.ts
//
// Where a request may go, given its mode and sign-in state. Pure so the
// proxy's redirects can be tested; src/lib/auth/proxy.ts supplies the inputs.

export const PROTECTED_ROUTES = [
  "/dashboard",
  "/learn",
  "/conversation",
  "/coach",
  "/just-speak",
  "/sound-library",
  "/dictionary",
  "/bookmarks",
  "/profile",
  "/desktop/setup",
] as const;

export const CLOUD_ONLY_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/checkout",
  "/onboarding",
] as const;

/** Cloud-only routes that need a signed-in user, unlike the sign-in pages. */
const SIGNED_IN_CLOUD_ROUTES = ["/checkout", "/onboarding"] as const;

export function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export type RouteDecision =
  | { action: "next" }
  /** Redirect, keeping the requested path as `?next=`. */
  | { action: "redirect"; pathname: string; keepNext: boolean };

export interface RouteGateInput {
  pathname: string;
  mode: "local" | "cloud" | null;
  hasLocalProfile: boolean;
  cloudConfigured: boolean;
  /** Only consulted in cloud mode; pass false when there is no session cookie. */
  signedIn: boolean;
}

/** Whether deciding this request needs the session cookie checked at all. */
export function needsSignInCheck(input: Omit<RouteGateInput, "signedIn">) {
  return (
    input.mode === "cloud" &&
    input.cloudConfigured &&
    (matchesRoute(input.pathname, PROTECTED_ROUTES) ||
      matchesRoute(input.pathname, CLOUD_ONLY_ROUTES))
  );
}

export function decideRoute(input: RouteGateInput): RouteDecision {
  const { pathname, mode } = input;
  const isProtected = matchesRoute(pathname, PROTECTED_ROUTES);
  const isCloudOnly = matchesRoute(pathname, CLOUD_ONLY_ROUTES);

  if (!mode) {
    if (isProtected || matchesRoute(pathname, SIGNED_IN_CLOUD_ROUTES)) {
      return { action: "redirect", pathname: "/setup", keepNext: true };
    }
    return { action: "next" };
  }

  if (mode === "local") {
    if (!input.hasLocalProfile && isProtected) {
      return { action: "redirect", pathname: "/setup", keepNext: true };
    }
    if (isCloudOnly) {
      return {
        action: "redirect",
        pathname: input.hasLocalProfile ? "/dashboard" : "/setup",
        keepNext: true,
      };
    }
    return { action: "next" };
  }

  if (!input.cloudConfigured) {
    if (isProtected || isCloudOnly) {
      return { action: "redirect", pathname: "/setup", keepNext: true };
    }
    return { action: "next" };
  }

  if (!input.signedIn && isProtected) {
    return { action: "redirect", pathname: "/login", keepNext: true };
  }

  if (!input.signedIn && matchesRoute(pathname, SIGNED_IN_CLOUD_ROUTES)) {
    return { action: "redirect", pathname: "/login", keepNext: true };
  }

  if (input.signedIn && isCloudOnly && !matchesRoute(pathname, SIGNED_IN_CLOUD_ROUTES)) {
    return { action: "redirect", pathname: "/dashboard", keepNext: false };
  }

  return { action: "next" };
}
