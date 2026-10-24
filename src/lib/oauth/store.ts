// FILE: src/lib/oauth/store.ts
//
// Clients, codes, tokens and grants for the MCP connector, in the oauthClients,
// oauthCodes, oauthTokens and oauthGrants collections. Every grant and token
// carries the learner's uid; tools act on that uid and no other.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";

import { db as adminDb } from "../server/firebase";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_MS,
  MAX_GRANT_LIFETIME_MS,
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
} from "./config";

/**
 * Firestore persistence for clients, codes, tokens, and grants.
 *
 * firestore.rules deny every client SDK access to these collections; only the
 * Admin SDK on this server reads or writes them.
 *
 * Secrets (codes, access tokens, refresh tokens) are 256-bit random values
 * that are never stored: the document id is their SHA-256 digest, so lookup
 * stays a single keyed read and a database leak exposes no usable credential.
 */

const COLLECTIONS = {
  clients: "oauthClients",
  codes: "oauthCodes",
  tokens: "oauthTokens",
  grants: "oauthGrants",
} as const;

export type OAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

export type TokenRecord = {
  clientId: string;
  scopes: string[];
  resource: string;
  grantId: string;
  uid: string;
};

export type IssuedTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
};

type OAuthError = "invalid_grant" | "invalid_scope" | "invalid_target";

export type TokenOutcome =
  | { ok: true; tokens: IssuedTokenSet; uid: string; grantId: string }
  | { ok: false; error: OAuthError; description: string };

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function generateSecret(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return Number(value.toMillis());
  }

  return typeof value === "number" ? value : 0;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/** PKCE S256 only: base64url(sha256(verifier)) must equal the stored challenge. */
export function verifyPkce(codeVerifier: string, codeChallenge: string) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier) || !codeChallenge) {
    return false;
  }

  const derived = createHash("sha256").update(codeVerifier).digest("base64url");
  return constantTimeEquals(derived, codeChallenge);
}

// Clients -------------------------------------------------------------------

export async function registerOAuthClient(input: { clientName: string; redirectUris: string[] }): Promise<OAuthClient> {
  const clientId = `cd_client_${randomBytes(16).toString("hex")}`;

  await adminDb().collection(COLLECTIONS.clients).doc(clientId).create({
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { clientId, clientName: input.clientName, redirectUris: input.redirectUris };
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  // Document ids are generated here; anything else is not worth a read, and a
  // slash would otherwise address a different path.
  if (!/^cd_client_[0-9a-f]{32}$/.test(clientId)) {
    return null;
  }

  const snapshot = await adminDb().collection(COLLECTIONS.clients).doc(clientId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Record<string, unknown>;

  return {
    clientId: snapshot.id,
    clientName: typeof data.clientName === "string" ? data.clientName : "MCP Client",
    redirectUris: toStringArray(data.redirectUris),
  };
}

// Authorization codes -------------------------------------------------------

export type AuthorizationCodeInput = {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  resource: string;
  uid: string;
};

export async function createAuthorizationCode(record: AuthorizationCodeInput) {
  if (!record.resource || !record.uid) {
    throw new Error("An authorization code needs a resource and a uid.");
  }

  const code = generateSecret("cd_ac");

  await adminDb()
    .collection(COLLECTIONS.codes)
    .doc(hashSecret(code))
    .create({
      clientId: record.clientId,
      redirectUri: record.redirectUri,
      scopes: record.scopes,
      codeChallenge: record.codeChallenge,
      codeChallengeMethod: "S256",
      resource: record.resource,
      uid: record.uid,
      expiresAt: Timestamp.fromMillis(Date.now() + AUTHORIZATION_CODE_TTL_MS),
      createdAt: FieldValue.serverTimestamp(),
    });

  return code;
}

type TokenWrite = { accessRef: DocumentReference; refreshRef: DocumentReference; data: Record<string, unknown>[] };

function buildTokenPair(input: { clientId: string; scopes: string[]; resource: string; grantId: string; uid: string; now: number }) {
  const tokens = adminDb().collection(COLLECTIONS.tokens);
  const accessToken = generateSecret("cd_at");
  const refreshToken = generateSecret("cd_rt");
  const shared = {
    clientId: input.clientId,
    scopes: input.scopes,
    resource: input.resource,
    grantId: input.grantId,
    uid: input.uid,
    createdAt: FieldValue.serverTimestamp(),
  };

  const write: TokenWrite = {
    accessRef: tokens.doc(hashSecret(accessToken)),
    refreshRef: tokens.doc(hashSecret(refreshToken)),
    data: [
      { ...shared, type: "access", expiresAt: Timestamp.fromMillis(input.now + ACCESS_TOKEN_TTL_SECONDS * 1000) },
      { ...shared, type: "refresh", expiresAt: Timestamp.fromMillis(input.now + REFRESH_TOKEN_TTL_MS) },
    ],
  };

  return { accessToken, refreshToken, write };
}

/**
 * Redeems an authorization code and issues the first token pair, in one
 * transaction.
 *
 * The code is single-use. Redeeming it turns its document into a tombstone
 * that remembers the grant it produced, rather than deleting it, so a second
 * redemption is not merely refused: it revokes that grant. A code presented
 * twice has leaked, and whoever redeemed it first may be the attacker (OAuth
 * 2.1 section 4.1.3). A failed check burns the code too, so a stolen code
 * cannot be guessed at against the PKCE verifier.
 */
export async function redeemAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenOutcome> {
  const invalid = (description: string): TokenOutcome => ({ ok: false, error: "invalid_grant", description });

  if (!input.code) {
    return invalid("The authorization code is invalid, expired, or already used.");
  }

  const db = adminDb();
  const codeRef = db.collection(COLLECTIONS.codes).doc(hashSecret(input.code));
  let leakedGrantId: string | null = null;

  const outcome = await db.runTransaction(async (tx): Promise<TokenOutcome> => {
    leakedGrantId = null;
    const snapshot = await tx.get(codeRef);

    if (!snapshot.exists) {
      return invalid("The authorization code is invalid, expired, or already used.");
    }

    const data = snapshot.data() as Record<string, unknown>;
    const now = Date.now();

    if (typeof data.consumedAtMs === "number") {
      if (typeof data.grantId === "string" && data.grantId) {
        tx.set(
          db.collection(COLLECTIONS.grants).doc(data.grantId),
          { revokedAtMs: now, revokedReason: "authorization_code_reuse" },
          { merge: true },
        );
        leakedGrantId = data.grantId;
      }

      return invalid("The authorization code is invalid, expired, or already used.");
    }

    // Every outcome from here on consumes the code.
    const burn = (description: string, error: OAuthError = "invalid_grant"): TokenOutcome => {
      tx.update(codeRef, { consumedAtMs: now });
      return { ok: false, error, description };
    };

    if (toMillis(data.expiresAt) <= now) {
      return burn("The authorization code is invalid, expired, or already used.");
    }

    if (asString(data.clientId) !== input.clientId) {
      return burn("The authorization code was issued to a different client.");
    }

    if (asString(data.redirectUri) !== input.redirectUri) {
      return burn("redirect_uri does not match the authorization request.");
    }

    if (data.codeChallengeMethod !== "S256" || !verifyPkce(input.codeVerifier, asString(data.codeChallenge))) {
      return burn("PKCE verification failed.");
    }

    const resource = asString(data.resource);
    const uid = asString(data.uid);

    if (!resource || !uid) {
      return burn("The authorization code is invalid, expired, or already used.");
    }

    if (input.resource && input.resource.replace(/\/+$/, "") !== resource) {
      return burn("resource does not match the authorization request.", "invalid_target");
    }

    const scopes = toStringArray(data.scopes);
    const grantId = randomBytes(16).toString("hex");
    const pair = buildTokenPair({ clientId: input.clientId, scopes, resource, grantId, uid, now });

    tx.create(db.collection(COLLECTIONS.grants).doc(grantId), {
      clientId: input.clientId,
      resource,
      uid,
      scopes,
      createdAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(pair.write.accessRef, pair.write.data[0]);
    tx.create(pair.write.refreshRef, pair.write.data[1]);
    tx.update(codeRef, { consumedAtMs: now, grantId });

    return {
      ok: true,
      uid,
      grantId,
      tokens: { accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scopes },
    };
  });

  if (leakedGrantId) {
    await deleteGrantTokens(leakedGrantId);
  }

  return outcome;
}

// Tokens --------------------------------------------------------------------

/**
 * Looks up an access token. The grant is read alongside it, so a revoked grant
 * stops working at once even if deleting its tokens failed part way.
 */
export async function verifyAccessToken(token: string): Promise<TokenRecord | null> {
  if (!token || token.length > 200) {
    return null;
  }

  const db = adminDb();
  const snapshot = await db.collection(COLLECTIONS.tokens).doc(hashSecret(token)).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Record<string, unknown>;

  if (data.type !== "access" || toMillis(data.expiresAt) <= Date.now()) {
    return null;
  }

  const record: TokenRecord = {
    clientId: asString(data.clientId),
    scopes: toStringArray(data.scopes),
    resource: asString(data.resource),
    grantId: asString(data.grantId),
    uid: asString(data.uid),
  };

  if (!record.clientId || !record.grantId || !record.uid) {
    return null;
  }

  const grant = await db.collection(COLLECTIONS.grants).doc(record.grantId).get();
  const grantData = grant.data() as Record<string, unknown> | undefined;

  if (!grantData || typeof grantData.revokedAtMs === "number" || grantData.uid !== record.uid) {
    return null;
  }

  return record;
}

/**
 * Redeems a refresh token and issues the next pair, all in one transaction.
 *
 * The grant document is read inside the transaction, and revocation marks
 * that document before deleting tokens, so a concurrent refresh either
 * finishes before the mark and has its tokens swept, or retries after it and
 * is refused.
 *
 * A redeemed token is kept as a `refresh_rotated` tombstone rather than
 * deleted, which is what makes reuse detectable. Presenting a tombstone after
 * the grace window means two parties hold the same refresh token, and the
 * whole grant is revoked; the legitimate client reconnects, and a thief loses
 * access whichever of them refreshed first (RFC 9700 section 4.14.2). Inside
 * the window it is a client retry: the pair issued the first time is retired
 * and a new one issued, so only one refresh token is ever live.
 */
export async function rotateRefreshToken(input: {
  token: string;
  clientId: string;
  requestedScopes: string[];
  resource?: string;
}): Promise<TokenOutcome> {
  const invalid = (description: string): TokenOutcome => ({ ok: false, error: "invalid_grant", description });

  if (!input.token || input.token.length > 200) {
    return invalid("The refresh token is invalid or expired.");
  }

  const db = adminDb();
  const tokens = db.collection(COLLECTIONS.tokens);
  const refreshRef = tokens.doc(hashSecret(input.token));
  let revokedGrantId: string | null = null;

  const outcome = await db.runTransaction(async (tx): Promise<TokenOutcome> => {
    revokedGrantId = null;
    const snapshot = await tx.get(refreshRef);

    if (!snapshot.exists) {
      return invalid("The refresh token is invalid or expired.");
    }

    const data = snapshot.data() as Record<string, unknown>;
    const now = Date.now();
    const grantId = asString(data.grantId);
    const uid = asString(data.uid);
    const resource = asString(data.resource);

    if (!grantId || !uid || !resource || data.clientId !== input.clientId) {
      return invalid("The refresh token is invalid or expired.");
    }

    const grantRef = db.collection(COLLECTIONS.grants).doc(grantId);
    const grantSnapshot = await tx.get(grantRef);

    const isRetry = data.type === "refresh_rotated";
    const successorRefresh = /^[0-9a-f]{64}$/.test(asString(data.successorRefresh)) ? asString(data.successorRefresh) : "";
    const successorAccess = /^[0-9a-f]{64}$/.test(asString(data.successorAccess)) ? asString(data.successorAccess) : "";

    if (isRetry) {
      const rotatedAtMs = typeof data.rotatedAtMs === "number" ? data.rotatedAtMs : 0;
      // All reads happen before any write, as transactions require.
      const successor = successorRefresh ? await tx.get(tokens.doc(successorRefresh)) : null;
      const successorLive = successor?.exists === true && successor.data()?.type === "refresh";

      // Outside the window, or after the pair it produced has itself been
      // redeemed, this is not a lost response being retried: two parties hold
      // the token.
      if (now - rotatedAtMs > REFRESH_REUSE_GRACE_MS || !successorLive) {
        tx.set(grantRef, { revokedAtMs: now, revokedReason: "refresh_token_reuse" }, { merge: true });
        revokedGrantId = grantId;
        return invalid("This refresh token was already used. The connection has been revoked; reconnect the client.");
      }
    } else if (data.type !== "refresh") {
      return invalid("The refresh token is invalid or expired.");
    }

    if (toMillis(data.expiresAt) <= now) {
      return invalid("The refresh token is invalid or expired.");
    }

    // Every grant is written with its first tokens, so a missing one means it
    // was deleted: treat that as revoked rather than recreating it.
    if (!grantSnapshot.exists) {
      return invalid("This connection has been revoked; reconnect the client.");
    }

    const grant = grantSnapshot.data() as Record<string, unknown>;

    if (typeof grant.revokedAtMs === "number") {
      return invalid("This connection has been revoked; reconnect the client.");
    }

    if (grant.uid !== uid || grant.clientId !== input.clientId || grant.resource !== resource) {
      return invalid("The refresh token is invalid or expired.");
    }

    const createdAtMs = typeof grant.createdAtMs === "number" ? grant.createdAtMs : 0;

    if (now - createdAtMs > MAX_GRANT_LIFETIME_MS) {
      tx.set(grantRef, { revokedAtMs: now, revokedReason: "max_lifetime" }, { merge: true });
      revokedGrantId = grantId;
      return invalid("This connection reached its maximum age; reconnect the client.");
    }

    if (input.resource && input.resource.replace(/\/+$/, "") !== resource) {
      return { ok: false, error: "invalid_target", description: "resource does not match the original grant." };
    }

    // Refresh may narrow scope, never widen it.
    const grantedScopes = toStringArray(data.scopes);
    const widened = input.requestedScopes.filter((scope) => !grantedScopes.includes(scope));

    if (widened.length > 0) {
      return { ok: false, error: "invalid_scope", description: "Refresh cannot request scopes beyond the original grant." };
    }

    if (isRetry) {
      // A retry inside the grace window: retire the pair issued the first
      // time so only one refresh token stays live, then issue again below.
      tx.delete(tokens.doc(successorRefresh));
      if (successorAccess) {
        tx.delete(tokens.doc(successorAccess));
      }
    }

    const scopes = input.requestedScopes.length > 0 ? input.requestedScopes : grantedScopes;
    const pair = buildTokenPair({ clientId: input.clientId, scopes, resource, grantId, uid, now });

    tx.create(pair.write.accessRef, pair.write.data[0]);
    tx.create(pair.write.refreshRef, pair.write.data[1]);
    // The redeemed token becomes a tombstone that remembers its successors, so
    // a later presentation can be told apart from a retry. It keeps its own
    // expiry, which is when a TTL policy may remove it. A retry keeps the
    // original rotation time, so repeated retries cannot stretch the window.
    tx.update(refreshRef, {
      type: "refresh_rotated",
      rotatedAtMs: isRetry && typeof data.rotatedAtMs === "number" ? data.rotatedAtMs : now,
      successorRefresh: pair.write.refreshRef.id,
      successorAccess: pair.write.accessRef.id,
    });

    return {
      ok: true,
      uid,
      grantId,
      tokens: { accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scopes },
    };
  });

  if (revokedGrantId) {
    await deleteGrantTokens(revokedGrantId);
  }

  return outcome;
}

/** Firestore rejects a batch over 500 writes. */
const MAX_BATCH_WRITES = 450;

/**
 * Deletes documents in chunks. A grant refreshed hourly keeps a tombstone per
 * refresh for as long as the refresh token would have lived, so it can hold
 * several hundred token documents, more than one batch may carry.
 */
export async function deleteInChunks(refs: DocumentReference[]) {
  const db = adminDb();

  for (let offset = 0; offset < refs.length; offset += MAX_BATCH_WRITES) {
    const batch = db.batch();
    refs.slice(offset, offset + MAX_BATCH_WRITES).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return refs.length;
}

async function deleteGrantTokens(grantId: string) {
  const snapshot = await adminDb().collection(COLLECTIONS.tokens).where("grantId", "==", grantId).get();
  return deleteInChunks(snapshot.docs.map((doc) => doc.ref));
}

/**
 * Revokes a grant: marks it first, then deletes its tokens.
 *
 * The order matters. A refresh reads the grant inside its transaction, so once
 * the mark is written no refresh can issue new tokens for it, and the sweep
 * that follows catches any that finished just before.
 */
export async function revokeGrantById(grantId: string, reason = "revoked") {
  await adminDb()
    .collection(COLLECTIONS.grants)
    .doc(grantId)
    .set({ revokedAtMs: Date.now(), revokedReason: reason }, { merge: true });
  return deleteGrantTokens(grantId);
}

/**
 * RFC 7009 revocation: revokes the presented token and every sibling from the
 * same grant. A token held by a different client than the one named in the
 * request is left alone.
 */
export async function revokeToken(token: string, clientId?: string) {
  if (!token || token.length > 200) {
    return;
  }

  const snapshot = await adminDb().collection(COLLECTIONS.tokens).doc(hashSecret(token)).get();

  if (!snapshot.exists) {
    return;
  }

  const data = snapshot.data() as Record<string, unknown>;

  if (clientId && data.clientId !== clientId) {
    return;
  }

  const grantId = asString(data.grantId);

  if (!grantId) {
    await snapshot.ref.delete();
    return;
  }

  await revokeGrantById(grantId, "client_revoked");
}

/** The connections a learner has approved, newest first, for the account page. */
export async function listGrantsForUid(uid: string) {
  const snapshot = await adminDb().collection(COLLECTIONS.grants).where("uid", "==", uid).get();
  const grants = snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as Record<string, unknown> & { id: string })
    .filter((grant) => typeof grant.revokedAtMs !== "number");
  const clients = await Promise.all(grants.map((grant) => getOAuthClient(asString(grant.clientId))));
  return grants
    .map((grant, index) => ({
      grantId: grant.id,
      clientName: clients[index]?.clientName ?? "MCP client",
      scopes: toStringArray(grant.scopes),
      createdAtMs: typeof grant.createdAtMs === "number" ? grant.createdAtMs : 0,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** Revokes one of the learner's own grants. False when it is not theirs. */
export async function revokeGrantForUid(uid: string, grantId: string) {
  if (!/^[0-9a-f]{32}$/.test(grantId)) return false;
  const grant = await adminDb().collection(COLLECTIONS.grants).doc(grantId).get();
  if (!grant.exists || grant.data()?.uid !== uid) return false;
  await revokeGrantById(grantId, "revoked_by_user");
  return true;
}

/** Account deletion: every grant marked revoked, then its tokens and the grant itself removed. */
export async function deleteAllForUid(uid: string) {
  const grants = await adminDb().collection(COLLECTIONS.grants).where("uid", "==", uid).get();
  for (const grant of grants.docs) {
    await revokeGrantById(grant.id, "account_deleted");
  }
  const leftovers = await adminDb().collection(COLLECTIONS.tokens).where("uid", "==", uid).get();
  const codes = await adminDb().collection(COLLECTIONS.codes).where("uid", "==", uid).get();
  await deleteInChunks([...leftovers.docs, ...codes.docs, ...grants.docs].map((doc) => doc.ref));
}
