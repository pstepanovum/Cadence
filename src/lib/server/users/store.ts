// FILE: src/lib/server/users/store.ts
//
// The owner's list of Cadence accounts, read live from users/{uid} (newest
// sign-ups first), with Firebase Auth for what the document lacks and for the
// last sign-in, and users/{uid}/progress/summary and devices for activity and
// platform. Nothing is cached or copied anywhere; only the row's fields leave.
//
// Firestore cannot search inside a string, so a search or a plan filter scans
// accounts in pages of 100, at most 1000 per request, and hands back a cursor
// wherever it stopped: a page can be short and still have a next one.
import { FieldPath, Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import type { Auth, UserRecord } from "firebase-admin/auth";

import { readAccount } from "../entitlement";
import { auth as defaultAuth, db as defaultDb } from "../firebase";
import { readSummary } from "../sync";
import { authTime, classifyPlan, encodeCursor, lastActive, latestPlatform, matchesPlanFilter, matchesQuery, type UserRow, type UsersQuery } from "./logic";

const SCAN_BATCH = 100;
const SCAN_MAX = 1000;

export interface UsersPage {
  users: UserRow[];
  nextCursor: string | null;
  total: number | null;
}

type Options = { db?: Firestore; auth?: Auth; now?: number };

function cursorOf(doc: DocumentSnapshot): string | null {
  const created = doc.get("createdAt");
  if (!(created instanceof Timestamp)) return null;
  return encodeCursor({ s: created.seconds, n: created.nanoseconds, id: doc.id });
}

async function authUsers(auth: Auth, uids: string[]): Promise<Map<string, UserRecord>> {
  const found = new Map<string, UserRecord>();
  if (!uids.length) return found;
  try {
    const result = await auth.getUsers(uids.map((uid) => ({ uid })));
    for (const user of result.users) found.set(user.uid, user);
  } catch (error) {
    // The list still shows what Firestore knows.
    console.error("[admin users] Auth lookup failed", error instanceof Error ? error.message : error);
  }
  return found;
}

/** The base row from the user document and its Auth record; activity and platform are filled in later. */
function baseRow(doc: DocumentSnapshot, user: UserRecord | undefined, now: number): UserRow {
  const account = readAccount(doc.data(), now);
  const { plan, planUntil } = classifyPlan(account, now);
  return {
    id: doc.id,
    email: account.email ?? user?.email ?? null,
    name: account.displayName ?? user?.displayName ?? null,
    createdAt: account.createdAt ?? authTime(user?.metadata.creationTime),
    lastActiveAt: null,
    plan,
    planUntil,
    platform: null,
    alsoUses: [],
  };
}

async function enrich(firestore: Firestore, rows: UserRow[], users: Map<string, UserRecord>): Promise<void> {
  if (!rows.length) return;
  const summaries = await firestore.getAll(...rows.map((row) => firestore.collection("users").doc(row.id).collection("progress").doc("summary")));
  await Promise.all(
    rows.map(async (row, index) => {
      const devices = await firestore.collection("users").doc(row.id).collection("devices").limit(20).get();
      const seen = devices.docs.map((device) => {
        const data = device.data();
        const pushAt = typeof data.push?.updatedAt === "number" ? data.push.updatedAt : null;
        const syncAt = typeof data.lastSyncAt === "number" ? data.lastSyncAt : null;
        return { platform: data.platform, at: Math.max(pushAt ?? 0, syncAt ?? 0) || null, syncAt };
      });
      const summary = readSummary(summaries[index]?.data());
      const user = users.get(row.id);
      row.platform = latestPlatform(seen);
      row.lastActiveAt = lastActive([summary.lastActiveAt, ...seen.map((device) => device.syncAt)], [authTime(user?.metadata.lastRefreshTime), authTime(user?.metadata.lastSignInTime)]);
    }),
  );
}

export async function listUsers(query: UsersQuery, options: Options = {}): Promise<UsersPage> {
  const firestore = options.db ?? defaultDb();
  const auth = options.auth ?? defaultAuth();
  const now = options.now ?? Date.now();
  const filtering = Boolean(query.q) || query.plan !== "all";

  const total = firestore
    .collection("users")
    .count()
    .get()
    .then((snapshot) => snapshot.data().count)
    .catch(() => null);

  const rows: UserRow[] = [];
  const users = new Map<string, UserRecord>();
  let after: Timestamp | null = query.cursor ? new Timestamp(query.cursor.s, query.cursor.n) : null;
  let afterId = query.cursor?.id ?? "";
  let scanned = 0;
  let nextCursor: string | null = null;

  for (;;) {
    const size = filtering ? SCAN_BATCH : query.limit - rows.length;
    let page = firestore.collection("users").orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(size);
    if (after) page = page.startAfter(after, afterId);
    const snapshot = await page.get();
    const found = await authUsers(auth, snapshot.docs.map((doc) => doc.id));
    found.forEach((user, uid) => users.set(uid, user));

    let stoppedAt: DocumentSnapshot | null = null;
    for (const doc of snapshot.docs) {
      scanned += 1;
      const row = baseRow(doc, users.get(doc.id), now);
      if (matchesPlanFilter(row.plan, query.plan) && matchesQuery(row, query.q)) rows.push(row);
      if (rows.length >= query.limit) {
        stoppedAt = doc;
        break;
      }
    }

    const last = snapshot.docs[snapshot.docs.length - 1];
    if (stoppedAt) {
      // Full: there may be more after this account, unless it was the very last one.
      nextCursor = stoppedAt === last && snapshot.docs.length < size ? null : cursorOf(stoppedAt);
      break;
    }
    if (snapshot.docs.length < size || !last) break;
    if (scanned >= SCAN_MAX) {
      nextCursor = cursorOf(last);
      break;
    }
    const created = last.get("createdAt");
    if (!(created instanceof Timestamp)) break;
    after = created;
    afterId = last.id;
  }

  await enrich(firestore, rows, users);
  return { users: rows, nextCursor, total: await total };
}
