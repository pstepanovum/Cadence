import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRequestRuntimeFromRequest } from "@/lib/runtime/request-runtime";
import {
  APP_MODE_COOKIE,
  getAppModeCookieOptions,
  parseAppMode,
} from "@/lib/app-mode";
import {
  createDefaultLocalProfile,
  readLocalProfileFromCookies,
  writeLocalProfile,
} from "@/lib/local-profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { mode?: string; next?: string }
    | null;
  const mode = parseAppMode(body?.mode);

  if (!mode) {
    return NextResponse.json({ error: "Invalid setup mode." }, { status: 400 });
  }

  if (mode === "cloud" && !isSupabaseConfigured) {
    return NextResponse.json(
      {
        error:
          "Cadence Cloud is not configured in this build yet. Continue in local mode or add Supabase keys.",
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    redirectTo: getRedirectTarget({
      mode,
      next: body?.next,
      runtime: getRequestRuntimeFromRequest(request),
    }),
  });

  response.cookies.set(APP_MODE_COOKIE, mode, getAppModeCookieOptions());

  if (mode === "local") {
    const existingProfile = readLocalProfileFromCookies(await cookies());
    writeLocalProfile(
      response.cookies,
      existingProfile ?? createDefaultLocalProfile(),
    );
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(APP_MODE_COOKIE);
  return response;
}

function getRedirectTarget({
  mode,
  next,
  runtime,
}: {
  mode: "local" | "cloud";
  next?: string;
  runtime: "desktop" | "web";
}) {
  const safeNext = typeof next === "string" && next.startsWith("/") ? next : null;

  if (mode === "cloud") {
    return "/signup";
  }

  if (runtime === "desktop") {
    return "/desktop/setup";
  }

  if (safeNext) {
    return safeNext;
  }

  return "/dashboard";
}
