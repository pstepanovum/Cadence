import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Profile fields the web app keeps in Supabase `user_metadata`. There is no
 * HTTP route for these — onboarding and the profile screen write them straight
 * through `supabase.auth.updateUser`, exactly as the web pages do.
 */
export interface Profile {
  displayName: string;
  practiceFocus: PracticeFocus;
  practiceCadence: PracticeCadence;
  onboardingCompleted: boolean;
}

export type PracticeFocus = "conversations" | "vowels" | "work" | "daily";
export type PracticeCadence = "5-minutes" | "15-minutes" | "30-minutes" | "weekend-only";

export const PRACTICE_FOCUS_OPTIONS: { value: PracticeFocus; label: string }[] = [
  { value: "conversations", label: "Conversation confidence" },
  { value: "vowels", label: "Short and long vowel control" },
  { value: "work", label: "Clearer speaking at work" },
  { value: "daily", label: "Daily speaking fluency" },
];

export const PRACTICE_CADENCE_OPTIONS: { value: PracticeCadence; label: string }[] = [
  { value: "5-minutes", label: "5 minutes a day" },
  { value: "15-minutes", label: "15 minutes a day" },
  { value: "30-minutes", label: "30 minutes a day" },
  { value: "weekend-only", label: "A few times a week" },
];

interface AuthState {
  session: Session | null;
  /** True until the stored session has been restored (or ruled out). */
  loading: boolean;
  profile: Profile;
  displayName: string;
  /** Saves profile fields to user metadata and refreshes the local copy. */
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

function readProfile(session: Session | null): Profile {
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const focus = PRACTICE_FOCUS_OPTIONS.some((option) => option.value === meta.practiceFocus)
    ? (meta.practiceFocus as PracticeFocus)
    : "conversations";
  const cadence = PRACTICE_CADENCE_OPTIONS.some((option) => option.value === meta.practiceCadence)
    ? (meta.practiceCadence as PracticeCadence)
    : "15-minutes";

  return {
    displayName:
      (typeof meta.displayName === "string" && meta.displayName.trim()) ||
      session?.user.email?.split("@")[0] ||
      "Learner",
    practiceFocus: focus,
    practiceCadence: cadence,
    onboardingCompleted: meta.onboardingCompleted === true,
  };
}

const FALLBACK_PROFILE: Profile = {
  displayName: "Learner",
  practiceFocus: "conversations",
  practiceCadence: "15-minutes",
  onboardingCompleted: false,
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  profile: FALLBACK_PROFILE,
  displayName: FALLBACK_PROFILE.displayName,
  updateProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        // A restore failure is the same as being signed out: show the sign-in
        // screen rather than hanging on the splash forever.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    const { data, error } = await supabase.auth.updateUser({ data: patch });
    if (error) throw error;
    // updateUser returns the fresh user but not a session, so refresh ours so
    // every screen reading the profile sees the change immediately.
    if (data.user) {
      const { data: refreshed } = await supabase.auth.getSession();
      setSession(refreshed.session);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(() => {
    const profile = readProfile(session);
    return { session, loading, profile, displayName: profile.displayName, updateProfile, signOut };
  }, [session, loading, updateProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
