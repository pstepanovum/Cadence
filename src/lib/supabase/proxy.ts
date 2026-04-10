// FILE: src/lib/supabase/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { APP_MODE_COOKIE, parseAppMode } from "@/lib/app-mode";
import { readLocalProfileFromCookies } from "@/lib/local-profile";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/config";

const protectedRoutes = [
  "/dashboard",
  "/learn",
  "/conversation",
  "/coach",
  "/profile",
  "/desktop/setup",
];

const cloudOnlyRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/checkout",
  "/onboarding",
];

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const mode = parseAppMode(request.cookies.get(APP_MODE_COOKIE)?.value);
  const localProfile = readLocalProfileFromCookies(request.cookies);

  if (!mode) {
    if (matchesRoute(pathname, protectedRoutes) || matchesRoute(pathname, ["/checkout", "/onboarding"])) {
      return redirectWithCookies(request, "/setup");
    }

    return NextResponse.next({
      request,
    });
  }

  if (mode === "local") {
    if (!localProfile && matchesRoute(pathname, protectedRoutes)) {
      return redirectWithCookies(request, "/setup");
    }

    if (matchesRoute(pathname, cloudOnlyRoutes)) {
      return redirectWithCookies(
        request,
        localProfile ? "/dashboard" : "/setup",
      );
    }

    return NextResponse.next({
      request,
    });
  }

  if (!isSupabaseConfigured || !supabaseUrl || !supabasePublishableKey) {
    if (matchesRoute(pathname, protectedRoutes) || matchesRoute(pathname, cloudOnlyRoutes)) {
      return redirectWithCookies(request, "/setup");
    }

    return NextResponse.next({
      request,
    });
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  const isAuthenticated = Boolean(data);

  if (!isAuthenticated && matchesRoute(pathname, protectedRoutes)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (isAuthenticated && matchesRoute(pathname, cloudOnlyRoutes)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.searchParams.delete("next");
    const redirectResponse = NextResponse.redirect(redirectUrl);
    copyCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

function redirectWithCookies(request: NextRequest, pathname: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}
