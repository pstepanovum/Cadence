import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import type { AppMode } from "@/lib/app-mode";
import { getAppMode } from "@/lib/app-mode";
import type { LocalProfile } from "@/lib/local-profile";
import { getLocalProfile } from "@/lib/local-profile";
import { resolveDeviceFromRequest } from "@/lib/pairing/request";
import { getSharedProfile } from "@/lib/pairing/service";
import { assertSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  email: string | null;
  createdAt: string;
  displayName: string;
  practiceFocus: string | null;
  practiceCadence: string | null;
  onboardingCompleted: boolean;
  isLocal: boolean;
  meta: Record<string, unknown>;
}

export interface AppSession {
  mode: AppMode | null;
  user: AppUser | null;
}

export async function getAppSession(): Promise<AppSession> {
  // A phone paired to this computer over the LAN presents a Cadence device
  // token. It is checked before anything else: the token names the identity,
  // and no cookie or Supabase session on the wire may override it.
  const device = await resolveDeviceFromRequest();
  if (device) {
    if (!device.ok) {
      // The token was ours but is revoked or expired. Returning "no user"
      // rather than falling through keeps a stale phone from silently landing
      // in some other identity; the route answers 401 and the phone unpairs.
      return { mode: "local", user: null };
    }

    const profile = await getSharedProfile();
    return {
      mode: "local",
      user: mapLocalProfileToAppUser({
        id: profile.id,
        displayName: profile.displayName,
        practiceFocus: "conversations",
        practiceCadence: "15-minutes",
        createdAt: profile.createdAt,
        onboardingCompleted: true,
      }),
    };
  }

  // Cloud mobile clients send a Supabase access token instead of cookies. The
  // Bearer branch runs first so stray cookies from a device's OS cookie
  // jar can never override the token identity.
  const bearerUser = await getBearerUser();
  if (bearerUser) {
    return {
      mode: "cloud",
      user: mapSupabaseUserToAppUser(bearerUser),
    };
  }

  const mode = await getAppMode();

  if (mode === "local") {
    const profile = await getLocalProfile();
    return {
      mode,
      user: profile ? mapLocalProfileToAppUser(profile) : null,
    };
  }

  if (mode === "cloud" && isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return {
      mode,
      user: user ? mapSupabaseUserToAppUser(user) : null,
    };
  }

  return {
    mode,
    user: null,
  };
}

export async function requireAppUser(pathname: string) {
  const session = await getAppSession();

  if (session.mode === "local" && session.user) {
    return session as AppSession & { user: AppUser; mode: "local" };
  }

  if (session.mode === "cloud" && session.user) {
    return session as AppSession & { user: AppUser; mode: "cloud" };
  }

  if (session.mode === "cloud") {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  redirect(`/setup?next=${encodeURIComponent(pathname)}`);
}

async function getBearerUser(): Promise<User | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const headerStore = await headers();
  const header = headerStore.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  const { supabaseUrl, supabasePublishableKey } = assertSupabaseConfig();
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  return user ?? null;
}

function mapLocalProfileToAppUser(profile: LocalProfile): AppUser {
  return {
    id: profile.id,
    email: null,
    createdAt: profile.createdAt,
    displayName: profile.displayName,
    practiceFocus: profile.practiceFocus,
    practiceCadence: profile.practiceCadence,
    onboardingCompleted: profile.onboardingCompleted,
    isLocal: true,
    meta: {},
  };
}

function mapSupabaseUserToAppUser(user: User): AppUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  return {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at,
    displayName:
      (typeof meta.displayName === "string" && meta.displayName.trim()) ||
      user.email?.split("@")[0] ||
      "Learner",
    practiceFocus:
      typeof meta.practiceFocus === "string" ? meta.practiceFocus : null,
    practiceCadence:
      typeof meta.practiceCadence === "string" ? meta.practiceCadence : null,
    onboardingCompleted: meta.onboardingCompleted === true,
    isLocal: false,
    meta,
  };
}
