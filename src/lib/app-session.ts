import "server-only";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { AppMode } from "@/lib/app-mode";
import { APP_MODE_COOKIE, parseAppMode } from "@/lib/app-mode";
import { chooseSessionSource } from "@/lib/auth/bearer";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { ensureUserRecord, type BillingState } from "@/lib/cloud/store";
import { getAdminAuth, isFirebaseServerConfigured } from "@/lib/firebase/admin";
import type { LocalProfile } from "@/lib/local-profile";
import { readLocalProfileFromCookies } from "@/lib/local-profile";
import { authenticateToken, getSharedProfile } from "@/lib/pairing/service";
import type { LevelPrefs } from "@/lib/platform/levels";

export interface AppUser {
  id: string;
  email: string | null;
  createdAt: string;
  displayName: string;
  practiceFocus: string | null;
  practiceCadence: string | null;
  onboardingCompleted: boolean;
  isLocal: boolean;
  /** Stripe state for a cloud user; null in local mode. */
  billing: BillingState | null;
  /** Level settings kept on the account (cloud only; elsewhere they stay on the device). */
  levels?: LevelPrefs | null;
  /** Placement items seen in earlier tests, compact (cloud only). */
  placementSeen?: string | null;
}

export interface AppSession {
  mode: AppMode | null;
  user: AppUser | null;
}

/**
 * Who is asking. The order is fixed by `chooseSessionSource`: a paired-device
 * token, then a Firebase ID token, then cookies. A bearer token always wins,
 * so stray cookies in a phone's cookie jar never override it.
 */
export async function getAppSession(): Promise<AppSession> {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const source = chooseSessionSource({
    authorization: headerStore.get("authorization"),
    modeCookie: parseAppMode(cookieStore.get(APP_MODE_COOKIE)?.value),
  });

  switch (source.kind) {
    case "device": {
      // A phone paired to this computer over the LAN. A token that is ours but
      // revoked or expired returns "no user" rather than falling through, so a
      // stale phone never lands in some other identity; the route answers 401
      // and the phone unpairs.
      const device = await authenticateToken(source.token);
      if (!device.ok) {
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

    case "id-token": {
      // Cloud mobile clients send a Firebase ID token. An invalid or revoked
      // one is "no user", never a fall-through to cookies, for the same reason.
      const identity = await verifyIdentity(() =>
        getAdminAuth().verifyIdToken(source.token, true),
      );
      return { mode: "cloud", user: identity ? await loadCloudUser(identity) : null };
    }

    case "local-cookie": {
      const profile = readLocalProfileFromCookies(cookieStore);
      return { mode: "local", user: profile ? mapLocalProfileToAppUser(profile) : null };
    }

    case "session-cookie": {
      const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
      const identity = sessionCookie
        ? await verifyIdentity(() => getAdminAuth().verifySessionCookie(sessionCookie, true))
        : null;
      return { mode: "cloud", user: identity ? await loadCloudUser(identity) : null };
    }

    default:
      return { mode: null, user: null };
  }
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

interface VerifiedIdentity {
  uid: string;
  email: string | null;
}

/** The identity behind a token or cookie, or null when it does not verify. */
async function verifyIdentity(
  verify: () => Promise<{ uid: string; email?: string }>,
): Promise<VerifiedIdentity | null> {
  if (!isFirebaseServerConfigured()) {
    return null;
  }

  try {
    const decoded = await verify();
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

async function loadCloudUser({ uid, email: tokenEmail }: VerifiedIdentity): Promise<AppUser> {
  const record = await ensureUserRecord(uid, tokenEmail);
  const email = tokenEmail ?? record.email;

  return {
    id: uid,
    email,
    createdAt: record.createdAt,
    displayName: record.displayName || email?.split("@")[0] || "Learner",
    practiceFocus: record.practiceFocus,
    practiceCadence: record.practiceCadence,
    onboardingCompleted: record.onboardingCompleted,
    isLocal: false,
    billing: record.billing,
    levels: record.levels,
    placementSeen: record.placementSeen,
  };
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
    billing: null,
  };
}
