import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { AppMode } from "@/lib/app-mode";
import { getAppMode } from "@/lib/app-mode";
import type { LocalProfile } from "@/lib/local-profile";
import { getLocalProfile } from "@/lib/local-profile";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
