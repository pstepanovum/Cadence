// Links from outside the app (the widgets, cadence:///) arrive as system
// paths. A bare "/" is ambiguous with the sign-in group's index and is dropped
// while that group is guarded off, so it is sent to the tabs instead.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  let route: string | null = null;
  if (path.startsWith("/")) {
    route = path.split(/[?#]/)[0];
  } else if (path.toLowerCase().startsWith("cadence:")) {
    try {
      const url = new URL(path);
      route = `/${url.host}${url.pathname}`.replace(/\/+/g, "/");
    } catch {
      route = null;
    }
  }
  return route === "/" ? "/(tabs)" : path;
}
