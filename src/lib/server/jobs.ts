// FILE: src/lib/server/jobs.ts
//
// The scheduled work, run by Cloud Scheduler against cadence-web
// (POST /api/jobs/daily once a day, POST /api/jobs/mail every five minutes;
// see docs/DEPLOY.md):
//
//   daily   purge detailed progress 90 days after Plus lapsed; retry account
//           deletions that did not finish; drop inbox cards nobody collected
//           in 90 days; queue trial-ending (web trials, 2 days ahead) and the
//           opt-in reminders; then deliver mail
//   mail    deliver whatever is waiting in mailQueue
import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";

import { currentStreak, shiftDay } from "../platform/progress-model";
import { runDeletion } from "./account";
import { readAccount } from "./entitlement";
import { appOrigin } from "./env";
import { db as defaultDb } from "./firebase";
import { deliverPending, mailKey, queueMail } from "./email/queue";
import { readSummary } from "./sync";

/** Collections that are Plus detail, purged after a lapse. */
export const DETAIL_COLLECTIONS = ["srs", "mastery", "attempts", "coachSessions", "devices", "advanced", "lessonAttempts", "lessonSessions", "conversationProgress", "moduleProgress"] as const;

export const BADGE_STREAKS = [7, 14, 30, 60, 100, 200, 365] as const;

export function isJobAuthorized(header: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.JOBS_SECRET?.trim();
  if (!secret || secret.length < 32 || !header) return false;
  const given = header.replace(/^\s*Bearer\s+/i, "").trim();
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(secret).digest());
}

const DAY_MS = 86_400_000;

export interface DailyReport {
  purged: number;
  deletionsRetried: number;
  inboxesCleared: number;
  queued: Record<string, number>;
  mail: Record<string, number>;
}

/** Which reminders a learner is due today, from the summary alone. Pure. */
export function remindersFor(input: {
  uid: string;
  name?: string;
  summary: ReturnType<typeof readSummary>;
  today: string;
  weekday: number;
  lastWeeklyMinutes: number | null;
  now: number;
}): { key: string; template: "streak-at-risk" | "weekly-summary" | "badge-earned" | "inactive-nudge"; props: Record<string, unknown> }[] {
  const { summary, today, uid } = input;
  const out: ReturnType<typeof remindersFor> = [];
  const yesterday = shiftDay(today, -1);
  const streak = currentStreak(summary, today);
  const name = input.name;

  if (summary.streak.lastDay === yesterday && streak >= 3) {
    out.push({ key: mailKey("streak-at-risk", uid, today), template: "streak-at-risk", props: { name, streak } });
  }
  const milestone = BADGE_STREAKS.find((days) => days === streak);
  if (milestone && (summary.streak.lastDay === today || summary.streak.lastDay === yesterday)) {
    out.push({ key: mailKey("badge", uid, String(milestone), summary.streak.lastDay ?? today), template: "badge-earned", props: { name, badge: `${milestone}-day streak`, description: `${milestone} days of practice in a row.` } });
  }
  if (summary.lastActiveAt) {
    const away = Math.floor((input.now - summary.lastActiveAt) / DAY_MS);
    if (away === 7 || away === 30) out.push({ key: mailKey("inactive", uid, String(away), String(summary.lastActiveAt)), template: "inactive-nudge", props: { name, daysAway: away } });
  }
  // Mondays, UTC: the week that just ended.
  if (input.weekday === 1 && summary.lastActiveAt && input.now - summary.lastActiveAt < 30 * DAY_MS) {
    const minutes = Math.max(0, summary.totalMinutes - (input.lastWeeklyMinutes ?? summary.totalMinutes));
    const weekAgo = shiftDay(today, -7);
    const activeDays = new Set(summary.recent.filter((r) => new Date(r.at).toISOString().slice(0, 10) >= weekAgo).map((r) => new Date(r.at).toISOString().slice(0, 10))).size;
    out.push({ key: mailKey("weekly", uid, today), template: "weekly-summary", props: { name, minutes, activeDays, streak } });
  }
  return out;
}

export async function runDailyJob(options: { db?: Firestore; now?: number } = {}): Promise<DailyReport> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const report: DailyReport = { purged: 0, deletionsRetried: 0, inboxesCleared: 0, queued: {}, mail: {} };
  const count = (template: string) => (report.queued[template] = (report.queued[template] ?? 0) + 1);

  // 1. Detail kept 90 days after Plus lapsed.
  const lapsed = await firestore.collection("users").where("detailPurgeAt", "<=", now).limit(200).get();
  for (const doc of lapsed.docs) {
    if (readAccount(doc.data(), now).isPlus) {
      await doc.ref.update({ detailPurgeAt: FieldValue.delete() });
      continue;
    }
    for (const name of DETAIL_COLLECTIONS) await firestore.recursiveDelete(doc.ref.collection(name));
    await doc.ref.update({ detailPurgeAt: FieldValue.delete(), detailPurgedAt: now });
    report.purged += 1;
  }

  // 2. Deletions that did not finish.
  const pending = await firestore.collection("deletions").where("status", "==", "pending").limit(50).get();
  for (const doc of pending.docs) {
    await runDeletion(doc.id, { db: firestore }).catch(() => undefined);
    report.deletionsRetried += 1;
  }

  // 3. Inbox cards nobody collected in 90 days.
  const stale = await firestore.collectionGroup("inbox").where("updatedAt", "<", now - 90 * DAY_MS).limit(200).get();
  for (const doc of stale.docs) {
    await doc.ref.delete();
    report.inboxesCleared += 1;
  }

  // 4. Web trials ending in about two days. App Store trials are Apple's to announce.
  const trials = await firestore.collection("users").where("plusSources.stripe.trial", "==", true).limit(500).get();
  for (const doc of trials.docs) {
    const record = readAccount(doc.data(), now).plusSources.stripe;
    if (!record?.active || !record.willRenew || record.expiresAt === null) continue;
    const left = record.expiresAt - now;
    if (left <= 36 * 3600_000 || left > 60 * 3600_000) continue;
    const key = mailKey("trial-ending", doc.id, String(record.expiresAt));
    if (await queueMail(key, { template: "trial-ending", uid: doc.id, props: { productId: record.productId, trialEndsAt: record.expiresAt, portalUrl: `${appOrigin()}/account` } }, { db: firestore, now })) count("trial-ending");
  }

  // 5. Opt-in reminders.
  const optedIn = await firestore.collection("users").where("emailPrefs.reminders", "==", true).limit(2000).get();
  const weekday = new Date(now).getUTCDay();
  // Summaries are read in batches (getAll), not one round trip per learner,
  // so two thousand opted-in learners fit well inside the request timeout.
  const summaries = new Map<string, DocumentSnapshot>();
  for (let start = 0; start < optedIn.docs.length; start += 300) {
    const refs = optedIn.docs.slice(start, start + 300).map((doc) => doc.ref.collection("progress").doc("summary"));
    if (refs.length === 0) continue;
    for (const snapshot of await firestore.getAll(...refs)) summaries.set(snapshot.ref.parent.parent?.id ?? "", snapshot);
  }
  for (const doc of optedIn.docs) {
    const summarySnapshot = summaries.get(doc.id);
    if (!summarySnapshot?.exists) continue;
    const summary = readSummary(summarySnapshot.data());
    const data = doc.data();
    const lastWeeklyMinutes = typeof data.weekly?.lastTotalMinutes === "number" ? data.weekly.lastTotalMinutes : null;
    const due = remindersFor({ uid: doc.id, name: typeof data.displayName === "string" ? data.displayName : undefined, summary, today, weekday, lastWeeklyMinutes, now });
    for (const item of due) {
      if (await queueMail(item.key, { template: item.template, uid: doc.id, props: item.props as never }, { db: firestore, now })) count(item.template);
    }
    if (weekday === 1) await doc.ref.set({ weekly: { lastTotalMinutes: summary.totalMinutes, at: now } }, { merge: true });
  }

  report.mail = await deliverPending({ db: firestore });
  return report;
}
