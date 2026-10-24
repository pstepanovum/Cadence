// FILE: src/lib/cloud/store.ts
//
// Every Firestore read and write cloud mode makes. All user data lives under
// users/{uid}, and every function here takes the uid of the already-verified
// session, never one from a request body:
//
//   users/{uid}                              profile, onboarding, billing
//   users/{uid}/moduleProgress/{moduleId}    unlocks, best exam score
//   users/{uid}/lessonSessions/{autoId}      one run through a lesson
//   users/{uid}/lessonAttempts/{autoId}      one scored word
//   users/{uid}/conversationProgress/{slug}  coach-led conversation results
//
// The learn catalog is not here: it is read from content/modules.sql in every
// mode (src/lib/learn-catalog.ts).
import "server-only";

import {
  AggregateField,
  FieldValue,
  Timestamp,
  type DocumentData,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  applyExamResult,
  type EndedSessionRecord,
  type ModuleProgressRecord,
} from "@/lib/cloud/progress-logic";
import type { ConversationProgressEntry } from "@/lib/conversation";

export interface BillingState {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
}

export interface CloudUserRecord {
  email: string | null;
  displayName: string | null;
  practiceFocus: string | null;
  practiceCadence: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  billing: BillingState;
}

export interface ProfilePatch {
  displayName?: string;
  practiceFocus?: string;
  practiceCadence?: string;
  onboardingCompleted?: boolean;
}

const ALREADY_EXISTS = 6;

function userRef(uid: string) {
  return getAdminDb().collection("users").doc(uid);
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function toTimestamp(iso: string | null) {
  return iso ? Timestamp.fromDate(new Date(iso)) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBilling(value: unknown): BillingState {
  const billing = (value ?? {}) as DocumentData;
  return {
    stripeCustomerId: readString(billing.stripeCustomerId),
    stripeSubscriptionId: readString(billing.stripeSubscriptionId),
    status: readString(billing.status),
    trialEnd: toIso(billing.trialEnd),
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd === true,
    cancelAt: toIso(billing.cancelAt),
  };
}

function readUserRecord(data: DocumentData): CloudUserRecord {
  return {
    email: readString(data.email),
    displayName: readString(data.displayName),
    practiceFocus: readString(data.practiceFocus),
    practiceCadence: readString(data.practiceCadence),
    onboardingCompleted: data.onboardingCompleted === true,
    createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
    billing: readBilling(data.billing),
  };
}

// --- Profile -----------------------------------------------------------------

/** The user's document, created on first sight so every signed-in user has one. */
export async function ensureUserRecord(uid: string, email: string | null): Promise<CloudUserRecord> {
  const ref = userRef(uid);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    return readUserRecord(snapshot.data() ?? {});
  }

  try {
    await ref.create({
      email,
      displayName: null,
      practiceFocus: null,
      practiceCadence: null,
      onboardingCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Two first requests raced; the other one created it.
    if ((error as { code?: number }).code !== ALREADY_EXISTS) {
      throw error;
    }
  }

  const created = await ref.get();
  return readUserRecord(created.data() ?? {});
}

export async function updateUserProfile(uid: string, patch: ProfilePatch) {
  await userRef(uid).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/** Merge Stripe state into users/{uid}.billing. Only the server writes these. */
export async function updateBilling(uid: string, fields: Partial<BillingState>) {
  const billing: Record<string, unknown> = { ...fields };
  if ("trialEnd" in fields) billing.trialEnd = toTimestamp(fields.trialEnd ?? null);
  if ("cancelAt" in fields) billing.cancelAt = toTimestamp(fields.cancelAt ?? null);

  await userRef(uid).set(
    { billing, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

// --- Lesson sessions and attempts -------------------------------------------

export async function startLessonSession(uid: string, lessonId: string, moduleId: number) {
  const ref = await userRef(uid).collection("lessonSessions").add({
    lessonId,
    moduleId,
    startedAt: FieldValue.serverTimestamp(),
    endedAt: null,
    ended: false,
    wordCount: null,
    avgScore: null,
    passed: null,
  });
  return ref.id;
}

/** Returns null when the session does not exist for this user. */
export async function finishLessonSession(
  uid: string,
  sessionId: string,
  result: { wordCount: number; avgScore: number; passed: boolean },
) {
  const ref = userRef(uid).collection("lessonSessions").doc(sessionId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};

  // A session ends once. Ending it again returns the result already stored
  // rather than overwriting it.
  if (data.ended === true) {
    return {
      id: sessionId,
      lesson_id: readString(data.lessonId),
      module_id: readNumber(data.moduleId),
      started_at: toIso(data.startedAt),
      ended_at: toIso(data.endedAt),
      word_count: readNumber(data.wordCount),
      avg_score: readNumber(data.avgScore),
      passed: data.passed === true,
    };
  }

  const endedAt = Timestamp.now();
  await ref.update({
    ended: true,
    endedAt,
    wordCount: result.wordCount,
    avgScore: result.avgScore,
    passed: result.passed,
  });

  return {
    id: sessionId,
    lesson_id: readString(data.lessonId),
    module_id: readNumber(data.moduleId),
    started_at: toIso(data.startedAt),
    ended_at: endedAt.toDate().toISOString(),
    word_count: result.wordCount,
    avg_score: result.avgScore,
    passed: result.passed,
  };
}

export interface LessonAttemptInput {
  lessonId: string;
  lessonWordId: string;
  word: string;
  score: number;
  ipaTarget: string | null;
  ipaTranscript: string | null;
  phonemeDetail: unknown;
  attemptNumber: number;
}

export async function recordLessonAttempt(uid: string, attempt: LessonAttemptInput) {
  const ref = await userRef(uid).collection("lessonAttempts").add({
    ...attempt,
    phonemeDetail: attempt.phonemeDetail ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Ended sessions for the given lessons, for the lesson cards' summaries. */
export async function listEndedLessonSessions(
  uid: string,
  lessonIds: string[],
): Promise<EndedSessionRecord[]> {
  if (lessonIds.length === 0) {
    return [];
  }

  // Firestore caps `in` at 30 values; a module has four lessons.
  const chunks: string[][] = [];
  for (let index = 0; index < lessonIds.length; index += 30) {
    chunks.push(lessonIds.slice(index, index + 30));
  }

  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      userRef(uid)
        .collection("lessonSessions")
        .where("ended", "==", true)
        .where("lessonId", "in", chunk)
        .get(),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        lessonId: String(data.lessonId),
        avgScore: readNumber(data.avgScore),
        passed: typeof data.passed === "boolean" ? data.passed : null,
      };
    }),
  );
}

export async function getLearningTotals(uid: string) {
  const user = userRef(uid);
  const [aggregate, recentSessions] = await Promise.all([
    user
      .collection("lessonAttempts")
      .aggregate({ count: AggregateField.count(), scoreSum: AggregateField.sum("score") })
      .get(),
    user
      .collection("lessonSessions")
      .where("ended", "==", true)
      .orderBy("startedAt", "desc")
      .limit(60)
      .select("startedAt")
      .get(),
  ]);

  const totals = aggregate.data();
  return {
    attemptCount: totals.count,
    scoreSum: totals.scoreSum ?? 0,
    sessionStarts: recentSessions.docs
      .map((doc) => toIso(doc.get("startedAt")))
      .filter((value): value is string => value !== null),
  };
}

// --- Module progress ---------------------------------------------------------

function readModuleProgress(moduleId: number, data: DocumentData | undefined): ModuleProgressRecord | null {
  if (!data) {
    return null;
  }
  return {
    moduleId,
    isUnlocked: data.isUnlocked === true,
    isCompleted: data.isCompleted === true,
    bestExamScore: readNumber(data.bestExamScore),
    unlockedAt: toIso(data.unlockedAt),
    completedAt: toIso(data.completedAt),
  };
}

function writableModuleProgress(record: ModuleProgressRecord) {
  return {
    moduleId: record.moduleId,
    isUnlocked: record.isUnlocked,
    isCompleted: record.isCompleted,
    bestExamScore: record.bestExamScore,
    unlockedAt: toTimestamp(record.unlockedAt),
    completedAt: toTimestamp(record.completedAt),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function moduleProgressRef(uid: string, moduleId: number) {
  return userRef(uid).collection("moduleProgress").doc(String(moduleId));
}

/** Module 1 starts unlocked. A no-op when it already has progress. */
export async function bootstrapModuleProgress(uid: string) {
  try {
    await moduleProgressRef(uid, 1).create(
      writableModuleProgress({
        moduleId: 1,
        isUnlocked: true,
        isCompleted: false,
        bestExamScore: null,
        unlockedAt: new Date().toISOString(),
        completedAt: null,
      }),
    );
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) {
      throw error;
    }
  }
}

export async function listModuleProgress(uid: string) {
  const snapshot = await userRef(uid).collection("moduleProgress").get();
  const progress = new Map<number, ModuleProgressRecord>();

  for (const doc of snapshot.docs) {
    const moduleId = Number(doc.id);
    const record = readModuleProgress(moduleId, doc.data());
    if (Number.isInteger(moduleId) && record) {
      progress.set(moduleId, record);
    }
  }

  return progress;
}

export async function getModuleProgress(uid: string, moduleId: number) {
  const snapshot = await moduleProgressRef(uid, moduleId).get();
  return readModuleProgress(moduleId, snapshot.data());
}

/** Record an exam score and unlock the next module, in one transaction. */
export async function applyExamToProgress(
  uid: string,
  moduleId: number,
  examScore: number,
  totalModules: number,
) {
  const db = getAdminDb();
  const currentRef = moduleProgressRef(uid, moduleId);
  const nextRef = moduleProgressRef(uid, moduleId + 1);

  return db.runTransaction(async (transaction) => {
    const [currentSnapshot, nextSnapshot] = await transaction.getAll(currentRef, nextRef);
    const result = applyExamResult({
      moduleId,
      examScore,
      totalModules,
      current: readModuleProgress(moduleId, currentSnapshot.data()),
      next: readModuleProgress(moduleId + 1, nextSnapshot.data()),
      now: new Date().toISOString(),
    });

    transaction.set(currentRef, writableModuleProgress(result.current));
    if (result.next) {
      transaction.set(nextRef, writableModuleProgress(result.next));
    }

    return { passed: result.passed, bestExamScore: result.current.bestExamScore };
  });
}

// --- Conversation progress ---------------------------------------------------

export async function listConversationProgress(uid: string) {
  const snapshot = await userRef(uid).collection("conversationProgress").get();
  const progress: Record<string, ConversationProgressEntry> = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();
    progress[doc.id] = {
      bestScore: readNumber(data.bestScore) ?? 0,
      lastScore: readNumber(data.lastScore) ?? 0,
      passed: data.passed === true,
      completedAt: toIso(data.completedAt),
      updatedAt: toIso(data.updatedAt) ?? new Date().toISOString(),
    };
  }

  return progress;
}

export async function saveConversationProgress(
  uid: string,
  moduleSlug: string,
  entry: ConversationProgressEntry,
) {
  await userRef(uid)
    .collection("conversationProgress")
    .doc(moduleSlug)
    .set({
      moduleSlug,
      bestScore: entry.bestScore,
      lastScore: entry.lastScore,
      passed: entry.passed,
      completedAt: toTimestamp(entry.completedAt),
      updatedAt: toTimestamp(entry.updatedAt),
    });
}
