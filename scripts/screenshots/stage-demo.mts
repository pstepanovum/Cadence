// FILE: scripts/screenshots/stage-demo.mts
//
// Stages a lived-in demo account for the store screenshots, against the
// Firebase emulators only: 30 days of practice with a 23-day streak, Cadence
// Plus (so the app pulls full detail), weak sounds for "sounds to fix",
// reviewed flashcards from the B1 pack, and a second, free account for the
// paywall capture. It refuses to run against anything but a demo- project on
// the emulators. scripts/screenshots/cleanup-demo.mts removes all of it.
//
//   firebase emulators:start --only auth,firestore --project demo-cadence
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_PROJECT_ID=demo-cadence node --import ./tests/register.mjs scripts/screenshots/stage-demo.mts
import { readFileSync } from "node:fs";

import { applyActivity, emptySummary, type Activity, type ActivityKind } from "../../src/lib/platform/progress-model.ts";
import { review, dayKey, type CardState } from "../../src/lib/platform/srs.ts";
import { auth, db } from "../../src/lib/server/firebase.ts";
import { DEMO, assertEmulator } from "./demo-accounts.mts";

assertEmulator();

const DAY = 86_400_000;
const NOW = Date.now();
const DAYS = 30;
const STREAK = 23;

let seed = 20261024;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const between = (low: number, high: number) => Math.round(low + rand() * (high - low));

async function account(email: string, password: string, displayName: string) {
  try {
    const existing = await auth().getUserByEmail(email);
    await auth().updateUser(existing.uid, { password, displayName, emailVerified: true });
    return existing.uid;
  } catch {
    return (await auth().createUser({ email, password, displayName, emailVerified: true })).uid;
  }
}

const plusUid = await account(DEMO.plus.email, DEMO.plus.password, "Sam");
const freeUid = await account(DEMO.free.email, DEMO.free.password, "Alex");

const profile = (displayName: string) => ({
  displayName,
  practiceFocus: "pronunciation",
  practiceCadence: "15-minutes",
  onboardingCompleted: true,
  emailPrefs: { reminders: false, newsletter: false },
  createdAt: NOW - 40 * DAY,
  updatedAt: NOW,
});

const plus = { active: true, source: "app_store", productId: "dev.pstepanov.cadence.plus.yearly", expiresAt: NOW + 300 * DAY, willRenew: true, updatedAt: NOW, eventAt: NOW, trial: false };
await db().collection("users").doc(plusUid).set({ ...profile("Sam"), email: DEMO.plus.email, plus, plusSources: { app_store: plus }, rcAppUserId: plusUid });
await db().collection("users").doc(freeUid).set({ ...profile("Alex"), email: DEMO.free.email });

// --- 30 days of practice: a 23-day streak after a two-day gap -------------------
const kinds: ActivityKind[] = ["lesson", "quiz", "flashcards", "pronunciation", "sentence_building", "matching"];
let summary = emptySummary();
for (let back = DAYS - 1; back >= 0; back -= 1) {
  if (back === STREAK || back === STREAK + 1) continue;
  const date = new Date(NOW - back * DAY);
  const sessions = back === 0 ? 2 : between(2, 4);
  for (let i = 0; i < sessions; i += 1) {
    const kind = kinds[between(0, kinds.length - 1)];
    const activity: Activity = {
      kind,
      refId: kind === "pronunciation" ? "sound.th" : kind === "lesson" ? `lesson.b1.l${between(1, 12)}` : `deck.b1`,
      level: "B1",
      score: between(62, 96),
      minutes: between(4, 9),
      completedLesson: kind === "lesson" && rand() < 0.5,
      day: dayKey(date),
      at: date.getTime() - (sessions - i) * 3_600_000,
    };
    summary = applyActivity(summary, activity);
  }
}
summary = { ...summary, placementLevel: "B1" } as typeof summary;
await db().collection("users").doc(plusUid).collection("progress").doc("summary").set(summary);
await db().collection("users").doc(freeUid).collection("progress").doc("summary").set(summary);

// --- weak sounds for "sounds to fix" --------------------------------------------
const soundScores: Record<string, number> = { "sound.th": 54, "sound.dh": 61, "sound.r": 66, "sound.ae": 71, "sound.ih": 74, "sound.v": 79, "sound.l": 86, "sound.s": 92, "sound.iy": 90 };
const sounds: Record<string, unknown> = {};
for (const [id, ema] of Object.entries(soundScores)) {
  const history = Array.from({ length: 12 }, (_, i) => ({ day: dayKey(new Date(NOW - (11 - i) * 2 * DAY)), score: Math.max(30, Math.min(100, ema - 14 + i * 1.4 + between(-4, 4))) }));
  sounds[id] = { attempts: between(18, 60), ema, best: Math.min(100, ema + 12), lastAt: NOW - between(1, 30) * 3_600_000, history };
}
await db().collection("users").doc(plusUid).collection("mastery").doc("sounds").set({ items: sounds, updatedAt: NOW });

// --- flashcards from the B1 pack, some due today -------------------------------
const pack = JSON.parse(readFileSync(new URL("../../public/packs/core-b1/v1/content.json", import.meta.url), "utf8")) as { exercises: { id: string; kind: string }[] };
const cardIds = pack.exercises.filter((e) => e.kind === "flashcard").map((e) => e.id).slice(0, 40);
const cards: Record<string, CardState & { updatedAt: number }> = {};
cardIds.forEach((id, index) => {
  let state: CardState | undefined;
  const reviews = 1 + (index % 4);
  for (let r = 0; r < reviews; r += 1) state = review(state, index % 7 === 0 && r === reviews - 1 ? "hard" : "good", new Date(NOW - (reviews - r) * 4 * DAY));
  if (index < 12) state = { ...state!, due: dayKey(new Date(NOW)) };
  cards[id] = { ...state!, updatedAt: NOW - index * 60_000 };
});
await db().collection("users").doc(plusUid).collection("srs").doc("cards").set({ cards, updatedAt: NOW });

console.log(`Staged ${DEMO.plus.email} (Plus, ${STREAK}-day streak, ${Object.keys(sounds).length} sounds, ${cardIds.length} cards) and ${DEMO.free.email} (free).`);
console.log(`Passwords: ${DEMO.plus.password} / ${DEMO.free.password} (emulator only).`);
