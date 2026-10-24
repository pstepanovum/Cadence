// FILE: src/components/learn-hub/sync.ts
//
// Progress sync for the web (docs/PLATFORM.md sections 4.1 and 5.1), the
// browser's half of what the phone does in mobile/src/learning/sync.ts.
// Every signed-in account picks up cards added through the MCP connector
// (GET /api/sync/inbox, then DELETE to acknowledge). With Plus the browser
// also uploads its flashcard states once (POST /api/sync/import), then pushes
// what changed (POST /api/sync/push) and pulls other devices' changes
// (GET /api/sync/pull), last writer wins per card. Best effort throughout:
// offline, nothing is lost, the next sync sends it. Nothing runs without an
// account or on your own Cadence with no cloud.
"use client";

import { cloudFetch } from "@/hooks/cloud-fetch";
import { readMe } from "@/components/account/me";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { notifyStored } from "@/hooks/use-stored";
import { addInboxCards, cardsSince, marksFor, mergePulledCards, pushBodies, type CustomCard, type SyncMarks, type SyncedCard } from "@/components/learn-hub/sync-logic";

export const SRS_KEY = "cadence.srs.v1";
export const CUSTOM_KEY = "cadence.cards.custom.v1";
const MARKS_KEY = "cadence.sync.v1";
const INSTALL_KEY = "cadence.install.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full; the next sync tries again.
  }
  notifyStored();
}

function installId(): string {
  let id = read<string | null>(INSTALL_KEY, null);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = `web-${crypto.randomUUID().replace(/-/g, "")}`;
    write(INSTALL_KEY, id);
  }
  return id;
}

export function loadCustomCards(): CustomCard[] {
  return read<CustomCard[]>(CUSTOM_KEY, []);
}

async function signedIn(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  try {
    const { getCurrentIdToken } = await import("@/lib/firebase/client");
    return Boolean(await getCurrentIdToken());
  } catch {
    return false;
  }
}

async function okJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`sync ${response.status}`);
  return response.json().catch(() => null);
}

async function syncOnce() {
  if (!(await signedIn())) return;
  const me = await readMe();
  if (!me?.uid || me.tier === "none") return;

  // Inbox: every tier.
  const inbox = (await okJson(await cloudFetch("/api/sync/inbox"))) as { cards?: unknown } | null;
  const delivered = addInboxCards(loadCustomCards(), inbox?.cards, Date.now());
  if (delivered.added > 0) write(CUSTOM_KEY, delivered.cards);
  if (delivered.ackIds.length > 0) {
    await cloudFetch("/api/sync/inbox", { method: "DELETE", json: { ids: delivered.ackIds } });
  }

  if (me.tier !== "full") return;

  const marks = marksFor(read<SyncMarks | null>(MARKS_KEY, null), me.uid);
  const id = installId();
  const now = Date.now();
  const states = read<Record<string, Partial<SyncedCard>>>(SRS_KEY, {});
  if (marks.importedAt === null) {
    // First sync with Plus in this browser: upload what it has, once.
    const [first, ...rest] = pushBodies(id, cardsSince(states, 0));
    const imported = await cloudFetch("/api/sync/import", { method: "POST", json: first });
    if (!imported.ok) throw new Error(`import ${imported.status}`);
    for (const body of rest) await okJson(await cloudFetch("/api/sync/push", { method: "POST", json: body }));
    marks.importedAt = now;
    marks.pushedAt = now;
  } else {
    const changed = cardsSince(states, marks.pushedAt);
    if (Object.keys(changed).length > 0) {
      for (const body of pushBodies(id, changed)) await okJson(await cloudFetch("/api/sync/push", { method: "POST", json: body }));
      marks.pushedAt = now;
    }
  }
  write(MARKS_KEY, marks);

  const query = marks.pullCursor ? `?since=${encodeURIComponent(marks.pullCursor)}` : "";
  const pulled = await okJson(await cloudFetch(`/api/sync/pull${query}`));
  const merged = mergePulledCards(read<Record<string, Partial<SyncedCard>>>(SRS_KEY, {}), pulled);
  if (merged.changed > 0) write(SRS_KEY, merged.cards);
  write(MARKS_KEY, { ...marks, pullCursor: merged.cursor ?? marks.pullCursor });
}

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Runs one sync now, or joins the one already running. Never throws. */
export function syncProgress(): Promise<void> {
  running ??= syncOnce()
    .catch(() => {
      // Offline or refused; everything is still in this browser.
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** A sync a moment after the last change, so a run of reviews goes up together. */
export function scheduleSync(delayMs = 3000) {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncProgress();
  }, delayMs);
}
