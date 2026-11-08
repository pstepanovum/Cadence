import AsyncStorage from "@react-native-async-storage/async-storage";
import { onIdTokenChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getProfile, patchProfile } from "@/api/endpoints";
import { getFirebaseAuth } from "@/lib/firebase";
import { signOutOfProviders } from "@/lib/firebase-providers";
import { clearPlan } from "@/notifications/schedule";
import {
  parseProfile,
  toProfile,
  type Profile,
  type StoredProfile,
} from "@/lib/profile";
import { useConnection } from "@/pairing/context";

export {
  PRACTICE_CADENCE_OPTIONS,
  type LearningGoal,
  type PracticeCadence,
  type PracticeFocus,
  type Profile,
} from "@/lib/profile";

/** The signed-in cloud account. Local mode has none. */
export interface AuthUser {
  uid: string;
  email: string | null;
  /** Firebase provider ids on the account: "password", "apple.com", "google.com". */
  providers: string[];
}

function toAuthUser(user: User): AuthUser {
  return { uid: user.uid, email: user.email, providers: user.providerData.map((info) => info.providerId) };
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
  /**
   * Set when the profile could not be loaded and nothing is cached. Treating
   * that as a new account would send a returning person through onboarding,
   * which then saves defaults over their real profile.
   */
  profileError: string | null;
  retryProfile: () => void;
  profile: Profile;
  displayName: string;
  /** Saves profile fields on the server and updates the local copy. */
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads the account after a sign-in method was added or removed. */
  refreshUser: () => void;
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
  profileError: null,
  retryProfile: () => {},
  profile: FALLBACK_PROFILE,
  displayName: FALLBACK_PROFILE.displayName,
  updateProfile: async () => {},
  signOut: async () => {},
  refreshUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready: connectionReady, mode } = useConnection();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userRestored, setUserRestored] = useState(() => getFirebaseAuth() === null);
  // Tagged with the account it belongs to, so switching accounts reads as
  // "not loaded yet" without an effect having to clear it first.
  const [loaded, setLoaded] = useState<{ uid: string; fields: StoredProfile } | null>(null);
  const [failed, setFailed] = useState<{ uid: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Bumped by every local write, so a profile fetch that started before the
  // write cannot land after it and put the old values back.
  const revision = useRef(0);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    // Fires once with the restored user (or null), on every sign-in and
    // sign-out, and when the token is refreshed (which linking a sign-in
    // method does), so it covers the cold start and the auth screens.
    return onIdTokenChanged(auth, (next) => {
      setUser((current) => {
        if (!next) return null;
        const fresh = toAuthUser(next);
        // Same account, same methods: keep the identity so nothing re-renders.
        return current && current.uid === fresh.uid && current.email === fresh.email && current.providers.join() === fresh.providers.join() ? current : fresh;
      });
      setUserRestored(true);
    });
  }, []);

  const cloud = connectionReady && mode === "cloud";
  const uid = cloud ? (user?.uid ?? null) : null;

  const fields = uid !== null && loaded?.uid === uid ? loaded.fields : null;
  const profileError = uid !== null && fields === null && failed?.uid === uid ? failed.message : null;

  useEffect(() => {
    if (!uid) return;

    let active = true;
    const started = revision.current;

    void (async () => {
      const cached = await readCachedProfile(uid);
      if (active && cached && revision.current === started) setLoaded({ uid, fields: cached });

      // One quiet retry covers a blip; only a successful answer can say the
      // account is new.
      for (let tries = 0; tries < 2; tries += 1) {
        try {
          const fresh = parseProfile(await withTimeout(getProfile(), PROFILE_TIMEOUT_MS));
          if (!active || revision.current !== started) return;
          setLoaded({ uid, fields: fresh });
          writeCachedProfile(uid, fresh);
          return;
        } catch {
          if (!active) return;
        }
      }

      // Offline, slow or the server is down: the cached copy stands if there is
      // one; otherwise say so and let the person try again.
      if (active && !cached && revision.current === started) {
        setFailed({ uid, message: "Cadence couldn't load your profile. Check your connection and try again." });
      }
    })();

    return () => {
      active = false;
    };
  }, [uid, attempt]);

  const retryProfile = useCallback(() => {
    setFailed(null);
    setAttempt((n) => n + 1);
  }, []);

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
    if (!auth) return;
    // The account's streak and review reminders stop with the account; the
    // watcher that would re-plan them unmounts once signed out.
    await clearPlan().catch(() => {});
    await signOutOfProviders();
    await firebaseSignOut(auth);
  }, []);

  const refreshUser = useCallback(() => {
    const current = getFirebaseAuth()?.currentUser;
    if (!current) return;
    void current
      .reload()
      .catch(() => {})
      .then(() => setUser(toAuthUser(current)));
  }, []);

  const loading = !userRestored;
  const profileReady = uid === null || fields !== null;

  const value = useMemo<AuthState>(() => {
    const profile = toProfile(fields ?? {}, user);
    return {
      user,
      loading,
      profileReady,
      profileError,
      retryProfile,
      profile,
      displayName: profile.displayName,
      updateProfile,
      signOut,
      refreshUser,
    };
  }, [user, loading, profileReady, profileError, retryProfile, fields, updateProfile, signOut, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
