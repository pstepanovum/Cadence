// FILE: src/components/advanced/recordings-store.ts
//
// The learner's own recordings in the browser (docs/PLATFORM.md section 19):
// audio blobs and the index (src/lib/platform/recordings.ts) in IndexedDB,
// in this browser only. On the desktop app that is the app's own local data
// folder, since Electron keeps IndexedDB in its profile directory. Never
// uploaded: a Plus account syncs the index's metadata, never audio.
"use client";

import { useEffect, useState } from "react";

import {
  addRecording,
  EMPTY_INDEX,
  exportName,
  kindForItem,
  parseIndex,
  recordingFileName,
  recordingId,
  removeRecordings,
  type Recording,
  type RecordingIndex,
} from "@/lib/platform/recordings.ts";
import { dayKey } from "@/lib/platform/srs.ts";
import { forgetRecordings, registerRecordingsIndex } from "./store";

const DB_NAME = "cadence-recordings";
const STORE = "files";
const INDEX_KEY = "index";
const EVENT = "cadence:recordings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot keep recordings."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the recordings store."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error("The recordings store refused the change."));
  });
}

export async function readIndex(): Promise<RecordingIndex> {
  try {
    return parseIndex(await withStore("readonly", (s) => s.get(INDEX_KEY)));
  } catch {
    return EMPTY_INDEX;
  }
}

registerRecordingsIndex(async () => ((await readIndex()).items.length ? readIndex() : null));

function changed() {
  window.dispatchEvent(new Event(EVENT));
}

/** Saves one take and its index entry; drops the takes it pushes out. */
export async function saveTake(blob: Blob, input: { itemId: string; text: string; durationMs: number; score?: number }): Promise<Recording> {
  const createdAt = Date.now();
  const id = recordingId(crypto.randomUUID().replace(/-/g, ""), createdAt);
  const mime = (blob.type || "audio/webm").split(";")[0];
  const recording: Recording = { id, itemId: input.itemId, kind: kindForItem(input.itemId), text: input.text.slice(0, 400), createdAt, durationMs: Math.round(input.durationMs), bytes: blob.size, file: recordingFileName(id, mime), mime, ...(typeof input.score === "number" ? { score: input.score } : {}) };
  const { index, evicted } = addRecording(await readIndex(), recording);
  await withStore("readwrite", (s) => {
    s.put(blob, recording.file);
    for (const old of evicted) s.delete(old.file);
    s.put(index, INDEX_KEY);
  });
  if (evicted.length) forgetRecordings(evicted.map((r) => r.id));
  changed();
  return recording;
}

export async function deleteTakes(ids: string[]): Promise<void> {
  const { index, removed } = removeRecordings(await readIndex(), ids);
  await withStore("readwrite", (s) => {
    for (const r of removed) s.delete(r.file);
    s.put(index, INDEX_KEY);
  });
  forgetRecordings(removed.map((r) => r.id));
  changed();
}

export async function takeBlob(recording: Recording): Promise<Blob | null> {
  const blob = await withStore<Blob>("readonly", (s) => s.get(recording.file)).catch(() => undefined);
  return blob ?? null;
}

/** Saves a take as a file on the learner's computer. */
export async function exportTake(recording: Recording): Promise<void> {
  const blob = await takeBlob(recording);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportName(recording, dayKey(new Date(recording.createdAt)));
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The index, re-read whenever a take is saved or deleted. */
export function useRecordingIndex(): RecordingIndex | null {
  const [index, setIndex] = useState<RecordingIndex | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => void readIndex().then((i) => alive && setIndex(i));
    refresh();
    window.addEventListener(EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, refresh);
    };
  }, []);
  return index;
}
