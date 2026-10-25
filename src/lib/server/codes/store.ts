// FILE: src/lib/server/codes/store.ts
//
// Friend codes in Firestore, through the Admin SDK only (firestore.rules deny
// every client):
//
//   friendCodes/{codeId}                    the code; codeId is the SHA-256 of the normalized code
//   friendCodes/{codeId}/redemptions/{uid}  who redeemed it and until when
//   users/{uid}.plusSources.code            the grant, a Plus record like the purchases'
//   rateLimits/redeem-*                     ten tries an hour per account, looking up and redeeming counted apart
//
// The grant is written with the resolved `plus` in the same transaction, the
// way the billing webhooks write theirs, so entitlement is still decided in
// one place (resolvePlus). When the code is the only thing keeping Plus on,
// the detail purge is scheduled 90 days after it ends; a purchase made later
// clears that, as any purchase does.
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { LAPSED_RETENTION_DAYS, hasPlus, isRecordActive, resolvePlus, type PlusSource } from "../../platform/engine-routing";
import { readAccount, writePlusSource, type StoredPlusRecord } from "../entitlement";
import { db as defaultDb, isAlreadyExists } from "../firebase";
import { LIMITS, hitRateLimit } from "../rate-limit";
import {
  CODE_PRODUCT_ID,
  DAY_MS,
  extendedGrantExpiry,
  generateCode,
  hashCode,
  isWellFormedCode,
  normalizeCode,
  parseFriendCode,
  parseStoredCode,
  redeemFailure,
  type CreateCodeInput,
  type FriendCode,
  type FriendCodeRedemption,
  type RedeemFailure,
} from "./logic";

export const CODES = "friendCodes";
const REDEMPTIONS = "redemptions";

type Options = { now?: number; db?: Firestore };

export type RedeemResult =
  | { ok: true; codeId: string; durationDays: number; expiresAt: number }
  | { ok: false; reason: RedeemFailure | "rate_limited" | "account_deleted" };

function codeRecord(codeId: string, expiresAt: number, now: number): StoredPlusRecord {
  return { active: true, source: "code", productId: CODE_PRODUCT_ID, expiresAt, willRenew: false, updatedAt: now, eventAt: now, codeId };
}

/**
 * Redeems a code for a signed-in account, in one transaction: the code, the
 * account's earlier redemption and its user document are read together, so
 * two redemptions can never both take the last place or both extend from
 * the same grant.
 */
export async function redeemCode(uid: string, input: unknown, options: Options & { email?: string | null } = {}): Promise<RedeemResult> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  if (!(await hitRateLimit(LIMITS.redeemUserHour, uid, { uid, now, db: firestore })).allowed) return { ok: false, reason: "rate_limited" };

  const normalized = normalizeCode(input);
  if (!isWellFormedCode(normalized)) return { ok: false, reason: "invalid" };

  const codeId = hashCode(normalized);
  const codeRef = firestore.collection(CODES).doc(codeId);
  const redemptionRef = codeRef.collection(REDEMPTIONS).doc(uid);
  const userRef = firestore.collection("users").doc(uid);
  const deletionRef = firestore.collection("deletions").doc(uid);

  return firestore.runTransaction(async (tx): Promise<RedeemResult> => {
    const [codeSnap, redemptionSnap, userSnap, deletionSnap] = await Promise.all([tx.get(codeRef), tx.get(redemptionRef), tx.get(userRef), tx.get(deletionRef)]);
    if (deletionSnap.exists) return { ok: false, reason: "account_deleted" };
    const code = codeSnap.exists ? parseFriendCode(codeSnap.data()) : null;
    const failure = redeemFailure(code, redemptionSnap.exists, now);
    if (failure || !code) return { ok: false, reason: failure ?? "invalid" };

    const account = readAccount(userSnap.exists ? userSnap.data() : undefined, now);
    const expiresAt = extendedGrantExpiry(account.plusSources.code ?? null, code.durationDays, now);
    const record = codeRecord(codeId, expiresAt, now);
    const sources = { ...account.plusSources, code: record };
    const plus = resolvePlus(sources, now);
    // Another active source keeps Plus on past the code: no purge to schedule.
    const othersActive = (Object.keys(sources) as PlusSource[]).some((key) => key !== "code" && isRecordActive(sources[key], now));
    const purge = othersActive ? FieldValue.delete() : expiresAt + LAPSED_RETENTION_DAYS * DAY_MS;

    if (userSnap.exists) {
      tx.update(userRef, { "plusSources.code": record, plus, detailPurgeAt: purge, updatedAt: FieldValue.serverTimestamp() });
    } else {
      // First sight of this account on the server: the same document ensureUserRecord makes.
      tx.create(userRef, {
        email: options.email ?? null,
        displayName: null,
        practiceFocus: null,
        practiceCadence: null,
        onboardingCompleted: false,
        plusSources: { code: record },
        plus,
        detailPurgeAt: purge,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.update(codeRef, { redemptions: code.redemptions + 1 });
    const redemption: FriendCodeRedemption = { uid, redeemedAt: now, grantExpiresAt: expiresAt, ...(options.email ? { email: options.email } : {}) };
    tx.set(redemptionRef, redemption);
    return { ok: true, codeId, durationDays: code.durationDays, expiresAt };
  });
}

export type PreviewResult = { ok: true; durationDays: number } | { ok: false; reason: RedeemFailure | "rate_limited" };

/** What a code would give, without redeeming it. Writes nothing but its own attempt counter. */
export async function previewCode(uid: string, input: unknown, options: Options = {}): Promise<PreviewResult> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  if (!(await hitRateLimit(LIMITS.redeemPreviewUserHour, uid, { uid, now, db: firestore })).allowed) return { ok: false, reason: "rate_limited" };

  const normalized = normalizeCode(input);
  if (!isWellFormedCode(normalized)) return { ok: false, reason: "invalid" };

  const codeRef = firestore.collection(CODES).doc(hashCode(normalized));
  const [codeSnap, redemptionSnap] = await Promise.all([codeRef.get(), codeRef.collection(REDEMPTIONS).doc(uid).get()]);
  const code = codeSnap.exists ? parseFriendCode(codeSnap.data()) : null;
  const failure = redeemFailure(code, redemptionSnap.exists, now);
  if (failure || !code) return { ok: false, reason: failure ?? "invalid" };
  return { ok: true, durationDays: code.durationDays };
}

export type FriendCodeSummary = FriendCode & { id: string; redemptionList: FriendCodeRedemption[] };

/** Creates a code. A custom code that already exists is refused; a generated one is drawn again. */
export async function createCode(input: CreateCodeInput, createdBy: string, options: Options = {}): Promise<FriendCodeSummary | "taken"> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = input.code ?? generateCode();
    const codeHash = hashCode(code);
    const document: FriendCode = {
      code,
      codeHash,
      label: input.label,
      durationDays: input.durationDays,
      maxRedemptions: input.maxRedemptions,
      redemptions: 0,
      expiresAt: input.expiresAt,
      disabled: false,
      createdAt: now,
      createdBy,
    };
    try {
      // create() fails when the document exists, which is the uniqueness check.
      await firestore.collection(CODES).doc(codeHash).create(document);
      return { ...document, id: codeHash, redemptionList: [] };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      if (input.code) return "taken";
    }
  }
  throw new Error("Could not draw an unused code.");
}

/** Every code, newest first, with who redeemed each, read leniently so a retired code still shows. */
export async function listCodes(options: { limit?: number; db?: Firestore } = {}): Promise<FriendCodeSummary[]> {
  const firestore = options.db ?? defaultDb();
  const snapshot = await firestore.collection(CODES).orderBy("createdAt", "desc").limit(options.limit ?? 200).get();
  const codes = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const code = parseStoredCode(doc.data());
      if (!code) return null;
      const redemptions = await doc.ref.collection(REDEMPTIONS).orderBy("redeemedAt", "desc").get();
      return { ...code, id: doc.id, redemptionList: redemptions.docs.map((entry) => entry.data() as FriendCodeRedemption) };
    }),
  );
  return codes.filter((code): code is FriendCodeSummary => code !== null);
}

/** Stops (or restarts) a code working. Grants already given are kept. False when there is no such code. */
export async function setCodeDisabled(codeId: string, disabled: boolean, options: { db?: Firestore } = {}): Promise<boolean> {
  try {
    await (options.db ?? defaultDb()).collection(CODES).doc(codeId).update({ disabled });
    return true;
  } catch (error) {
    if ((error as { code?: unknown })?.code === 5) return false;
    throw error;
  }
}

export type RevokeResult = "revoked" | "not_found" | "already_revoked";

/**
 * Takes back what one redemption gave. The account's code grant ends now only
 * when this code wrote it; a grant from a later code and every purchase are
 * left alone. The redemption is kept, marked revoked, so the same account
 * cannot simply redeem the code again.
 */
export async function revokeRedemption(codeId: string, uid: string, options: Options = {}): Promise<{ result: RevokeResult; grantDeleted: boolean }> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const redemptionRef = firestore.collection(CODES).doc(codeId).collection(REDEMPTIONS).doc(uid);
  const userRef = firestore.collection("users").doc(uid);

  return firestore.runTransaction(async (tx) => {
    const [redemptionSnap, userSnap] = await Promise.all([tx.get(redemptionRef), tx.get(userRef)]);
    if (!redemptionSnap.exists) return { result: "not_found" as const, grantDeleted: false };
    if (typeof (redemptionSnap.data() as FriendCodeRedemption).revokedAt === "number") return { result: "already_revoked" as const, grantDeleted: false };

    const data = userSnap.exists ? userSnap.data() : undefined;
    const grant = readAccount(data, now).plusSources.code;
    const ownsGrant = Boolean(grant && grant.codeId === codeId && hasPlus(grant, now));
    if (ownsGrant && data) {
      writePlusSource(tx, userRef, data, { ...codeRecord(codeId, now, now), active: false }, now);
    }
    tx.update(redemptionRef, { revokedAt: now });
    return { result: "revoked" as const, grantDeleted: ownsGrant };
  });
}

/** Account deletion: the redemptions carry a uid and an address, so they go with the account. */
export async function deleteRedemptionsFor(uid: string, firestore: Firestore = defaultDb()): Promise<void> {
  for (;;) {
    const snapshot = await firestore.collectionGroup(REDEMPTIONS).where("uid", "==", uid).limit(400).get();
    if (snapshot.empty) return;
    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}
