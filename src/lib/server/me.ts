// FILE: src/lib/server/me.ts
//
// GET /api/me's body: the account as every client needs it (profile basics,
// Plus resolved from verified webhooks only, the data tier, today's cloud AI
// quota). It runs on every app open, so it reads as little as it can: the
// user document always, and today's usage and the breaker only for an account
// that can use the cloud AI at all (Plus on the hosted cloud). The summary is
// not here; POST /api/sync/summary returns it with the round that changes it.
import type { Firestore } from "firebase-admin/firestore";

import { dataTier, EMPTY_USAGE } from "../platform/engine-routing";
import { getAccount } from "./entitlement";
import { db as defaultDb } from "./firebase";
import type { CloudIdentity } from "./identity";
import { isBreakerTripped, quotaSummary, todaysUsage } from "./quota";

export async function loadMe(identity: Pick<CloudIdentity, "uid" | "email" | "emailVerified">, options: { hosted: boolean; db?: Firestore; now?: number }) {
  const firestore = options.db ?? defaultDb();
  const { uid, email, emailVerified } = identity;
  const account = await getAccount(uid, firestore);
  const cloudAi = options.hosted && account.isPlus;
  const [usage, paused] = cloudAi
    ? await Promise.all([todaysUsage(uid, { db: firestore, now: options.now }), isBreakerTripped({ db: firestore, now: options.now })])
    : [{ ...EMPTY_USAGE }, false];
  return {
    uid,
    email,
    emailVerified,
    displayName: account.displayName,
    plus: account.plus,
    isPlus: account.isPlus,
    tier: dataTier(true, account.isPlus),
    cloudAi,
    quota: { ...quotaSummary(usage), paused },
    cloudPaused: paused,
    newsletter: account.emailPrefs.newsletter,
    detailPurgeAt: account.detailPurgeAt,
    emailPrefs: account.emailPrefs,
  };
}
