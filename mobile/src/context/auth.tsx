import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getProfile, patchProfile } from "@/api/endpoints";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  parseProfile,
  toProfile,
  type Profile,
  type StoredProfile,
} from "@/lib/profile";
import { useConnection } from "@/pairing/context";

export {
  PRACTICE_CADENCE_OPTIONS,
  PRACTICE_FOCUS_OPTIONS,
  type PracticeCadence,
  type PracticeFocus,
  type Profile,
} from "@/lib/profile";

/** The signed-in cloud account. Local mode has none. */
export interface AuthUser {
  uid: string;
  email: string | null;
}

interface AuthState {
  user: AuthUser | null;
  /** True until the stored sign-in has been restored or ruled out. */
  loading: boolean;
  /**
   * False while a signed-in account's profile is still on its way. Until then
   * nobody can tell whether onboarding is done, so the navigator waits.
   */
  profileReady: boolean;
  profile: Profile;
  displayName: string;
  /** Saves profile fields on the server and updates the local copy. */
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
}

const FALLBACK_PROFILE = toProfile({}, null);

const profileKey = (uid: string) => `cadence.profile.${uid}`;

/** How long a cold start waits on the server before trusting the cached copy. */
const PROFILE_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out loading your profile.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function readCachedProfile(uid: string): Promise<StoredProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid));
    return raw ? parseProfile(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(uid: string, fields: StoredProfile): void {
  AsyncStorage.setItem(profileKey(uid), JSON.stringify(fields)).catch(() => {
    // Only a cold-start convenience; the server copy is the real one.
  });
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  profileReady: false,
  profile: FALLBACK_PROFILE,
  displayName: FALLBACK_PROFILE.displayName,
  updateProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready: connectionReady, mode } = useConnection();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userRestored, setUserRestored] = useState(() => getFirebaseAuth() === null);
  // Tagged with the account it belongs to, so switching accounts reads as
  // "not loaded yet" without an effect having to clear it first.
  const [loaded, setLoaded] = useState<{ uid: string; fields: StoredProfile } | null>(null);
  // Bumped by every local write, so a profile fetch that started before the
  // write cannot land after it and put the old values back.
  const revision = useRef(0);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    // Fires once with the restored user (or null) and again on every sign-in
    // and sign-out, so it covers both the cold start and the auth screens.
    return onAuthStateChanged(auth, (next) => {
      setUser(next ? { uid: next.uid, email: next.email } : null);
      setUserRestored(true);
    });
  }, []);

  const cloud = connectionReady && mode === "cloud";
  const uid = cloud ? (user?.uid ?? null) : null;

  const fields = uid !== null && loaded?.uid === uid ? loaded.fields : null;

  useEffect(() => {
    if (!uid) return;

    let active = true;
    const started = revision.current;

    void (async () => {
      const cached = await readCachedProfile(uid);
      if (active && cached && revision.current === started) setLoaded({ uid, fields: cached });

      try {
        const fresh = parseProfile(await withTimeout(getProfile(), PROFILE_TIMEOUT_MS));
        if (!active || revision.current !== started) return;
        setLoaded({ uid, fields: fresh });
        writeCachedProfile(uid, fresh);
      } catch {
        // Offline, slow or the server is down: keep the cached copy, or treat
        // the account as new so onboarding (which writes it back) can run.
        if (active && !cached && revision.current === started) setLoaded({ uid, fields: {} });
      }
    })();

    return () => {
      active = false;
    };
  }, [uid]);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!uid) throw new Error("Sign in to Cadence Cloud to save your profile.");
      revision.current += 1;
      const saved = parseProfile(await patchProfile(patch));
      const next = { ...fields, ...patch, ...saved };
      setLoaded({ uid, fields: next });
      writeCachedProfile(uid, next);
    },
    [uid, fields],
  );

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) await firebaseSignOut(auth);
  }, []);

  const loading = !userRestored;
  const profileReady = uid === null || fields !== null;

  const value = useMemo<AuthState>(() => {
    const profile = toProfile(fields ?? {}, user);
    return {
      user,
      loading,
      profileReady,
      profile,
      displayName: profile.displayName,
      updateProfile,
      signOut,
    };
  }, [user, loading, profileReady, fields, updateProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
