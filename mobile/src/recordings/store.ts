// The learner's own recordings on the phone (docs/PLATFORM.md section 19):
// each take is moved from the recorder's cache into the app's documents
// directory (Documents/recordings/), with the index from
// src/platform/recordings.ts beside it in index.json. Optional copy in the
// learner's iCloud Drive (icloud.ts). Never uploaded to the Cadence cloud; a
// Plus account syncs only the index's metadata (learning/advanced-store.ts).
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";

import { forgetRecordings, registerRecordingIndex } from "@/learning/advanced-store";
import {
  addRecording,
  EMPTY_INDEX,
  exportName,
  kindForItem,
  parseIndex,
  recordingFileName,
  recordingId,
  removeRecordings,
  updateRecording,
  type Recording,
  type RecordingIndex,
} from "@/platform/recordings";

import { copyToICloud, removeFromICloud } from "./icloud";

const ROOT = "recordings";
const listeners = new Set<() => void>();
let cache: RecordingIndex | null = null;
let queue: Promise<unknown> = Promise.resolve();

function dir(): Directory {
  const d = new Directory(Paths.document, ROOT);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

const indexFile = () => new File(dir(), "index.json");
export const fileFor = (recording: Recording) => new File(dir(), recording.file);

export async function readIndex(): Promise<RecordingIndex> {
  if (cache) return cache;
  try {
    const file = indexFile();
    cache = file.exists ? parseIndex(JSON.parse(await file.text())) : EMPTY_INDEX;
  } catch {
    cache = EMPTY_INDEX;
  }
  return cache;
}

registerRecordingIndex(async () => {
  const index = await readIndex();
  return index.items.length ? index : null;
});

function write(index: RecordingIndex) {
  cache = index;
  indexFile().write(JSON.stringify(index));
  for (const l of listeners) l();
}

/** Serialises every change, so two quick takes never lose each other's index entry. */
function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

function discard(recording: Recording) {
  try {
    const file = fileFor(recording);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
  void removeFromICloud(recording.file);
}

/** Keeps a take: moves the recorder's file in, adds it to the index, drops what it pushes out. */
export function saveTake(input: { uri: string; mime: string; itemId: string; text: string; durationMs: number; score?: number }): Promise<Recording> {
  return serial(async () => {
    const createdAt = Date.now();
    const id = recordingId(Crypto.randomUUID().replace(/-/g, ""), createdAt);
    const source = new File(input.uri);
    const file = recordingFileName(id, input.mime);
    const target = new File(dir(), file);
    source.move(target);
    const recording: Recording = {
      id,
      itemId: input.itemId,
      kind: kindForItem(input.itemId),
      text: input.text.slice(0, 400),
      createdAt,
      durationMs: Math.round(input.durationMs),
      bytes: target.size ?? 0,
      file,
      mime: input.mime,
      ...(typeof input.score === "number" ? { score: input.score } : {}),
    };
    const { index, evicted } = addRecording(await readIndex(), recording);
    for (const old of evicted) discard(old);
    write(index);
    if (evicted.length) forgetRecordings(evicted.map((r) => r.id));
    void copyToICloud(target.uri, file).then((copied) => {
      if (copied) void serial(async () => write(updateRecording(await readIndex(), id, { icloud: "copied" })));
    });
    return recording;
  });
}

export function deleteTakes(ids: string[]): Promise<void> {
  return serial(async () => {
    const { index, removed } = removeRecordings(await readIndex(), ids);
    for (const r of removed) discard(r);
    write(index);
    forgetRecordings(removed.map((r) => r.id));
  });
}

/** Copies every take not yet in iCloud Drive; returns how many went. */
export function copyPendingToICloud(): Promise<number> {
  return serial(async () => {
    let index = await readIndex();
    let copied = 0;
    for (const r of index.items.filter((x) => x.icloud !== "copied")) {
      const file = fileFor(r);
      if (file.exists && (await copyToICloud(file.uri, r.file))) {
        index = updateRecording(index, r.id, { icloud: "copied" });
        copied += 1;
      }
    }
    if (copied) write(index);
    return copied;
  });
}

/** Opens the share sheet with a copy named after the sentence (save to Files, AirDrop, a message). */
export async function exportTake(recording: Recording, day: string): Promise<boolean> {
  const source = fileFor(recording);
  if (!source.exists || !(await Sharing.isAvailableAsync())) return false;
  const shareDir = new Directory(Paths.cache, "recording-exports");
  if (!shareDir.exists) shareDir.create({ intermediates: true });
  const copy = new File(shareDir, exportName(recording, day));
  if (copy.exists) copy.delete();
  source.copy(copy);
  await Sharing.shareAsync(copy.uri, { mimeType: recording.mime, dialogTitle: "Save or send this recording" });
  return true;
}

/** The index, kept current as takes are saved and deleted. */
export function useRecordingIndex(): RecordingIndex | null {
  const [index, setIndex] = useState<RecordingIndex | null>(cache);
  useEffect(() => {
    let alive = true;
    const refresh = () => void readIndex().then((i) => alive && setIndex(i));
    listeners.add(refresh);
    refresh();
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  return index;
}
