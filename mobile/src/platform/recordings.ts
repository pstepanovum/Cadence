// FILE: mobile/src/platform/recordings.ts
//
// The learner's own recordings (docs/PLATFORM.md section 19): one take of a
// sentence, phrase, slang example or drill, kept to listen back next to the
// target. The audio lives only where it was made (the phone's documents
// directory, optionally the learner's iCloud Drive; IndexedDB in a browser;
// the local data folder on the desktop) and is never uploaded to the Cadence
// cloud. This module is the index every store keeps beside the files: its
// records, limits, grouping for the library, and the metadata a Plus account
// may sync (no audio, no file paths). Pure: no file system, no clock.
//
// Twin: src/lib/platform/recordings.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

export const RECORDING_KINDS = ["phrase", "slang", "sentence", "lesson", "drill", "fossil", "other"] as const;
export type RecordingKind = (typeof RECORDING_KINDS)[number];

export const RECORDING_KIND_LABELS: Record<RecordingKind, string> = {
  phrase: "Phrase",
  slang: "Slang",
  sentence: "Sentence",
  lesson: "Lesson",
  drill: "Plateau drill",
  fossil: "Plateau drill",
  other: "Other",
};

export interface Recording {
  /** Random, unique per take. */
  id: string;
  /** The item recorded: a phrase, slang, exercise or drill-step id. */
  itemId: string;
  kind: RecordingKind;
  /** What the learner was saying (the target text). */
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  durationMs: number;
  bytes: number;
  /** File name inside the store's own folder; never a full path. */
  file: string;
  mime: string;
  /** iOS only: whether a copy sits in the learner's iCloud Drive. */
  icloud?: "pending" | "copied";
  /** The engine's score for the take, when it was scored. */
  score?: number;
}

export interface RecordingIndex {
  format: 1;
  items: Recording[];
}

/** Takes kept per item; the oldest beyond this goes (the learner can delete sooner). */
export const MAX_TAKES_PER_ITEM = 10;
/** Takes kept in all, so a phone never fills up with practice audio. */
export const MAX_RECORDINGS = 1000;
/** A take longer than this is cut off by the recorder. */
export const MAX_TAKE_SECONDS = 30;

export const EMPTY_INDEX: RecordingIndex = { format: 1, items: [] };

const ID = /^[a-z0-9][a-z0-9-]{5,40}$/;
const FILE = /^[a-z0-9][a-z0-9._-]{0,120}\.(wav|m4a|webm|ogg|mp4|caf)$/;
const ITEM = /^[a-z0-9][a-z0-9._:#-]{0,140}$/;

export function isRecording(value: unknown): value is Recording {
  if (!value || typeof value !== "object") return false;
  const r = value as Recording;
  return (
    typeof r.id === "string" && ID.test(r.id) &&
    typeof r.itemId === "string" && ITEM.test(r.itemId) &&
    (RECORDING_KINDS as readonly string[]).includes(r.kind) &&
    typeof r.text === "string" && r.text.length <= 400 &&
    Number.isFinite(r.createdAt) && Number.isFinite(r.durationMs) && Number.isFinite(r.bytes) &&
    typeof r.file === "string" && FILE.test(r.file) &&
    typeof r.mime === "string" && /^audio\/[a-z0-9.+-]+$/.test(r.mime)
  );
}

/** A stored index, keeping every valid record and dropping the rest (never throws). */
export function parseIndex(value: unknown): RecordingIndex {
  if (!value || typeof value !== "object" || (value as RecordingIndex).format !== 1 || !Array.isArray((value as RecordingIndex).items)) return { format: 1, items: [] };
  const seen = new Set<string>();
  const items: Recording[] = [];
  for (const item of (value as RecordingIndex).items) {
    if (!isRecording(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return { format: 1, items: items.sort((a, b) => a.createdAt - b.createdAt) };
}

/** A file-system-safe id from random bytes the caller supplies (hex or base36), plus the time. */
export function recordingId(random: string, createdAt: number): string {
  const r = random.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12).padEnd(6, "0");
  return `${createdAt.toString(36)}-${r}`;
}

export function extensionFor(mime: string): string {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("caf")) return "caf";
  if (mime.includes("mp4") && !mime.includes("m4a")) return "mp4";
  return "m4a";
}

export function recordingFileName(id: string, mime: string): string {
  return `${id}.${extensionFor(mime)}`;
}

/** What kind of item an id names, for the library's labels. */
export function kindForItem(itemId: string): RecordingKind {
  if (itemId.startsWith("phrase.")) return "phrase";
  if (itemId.startsWith("slang.")) return "slang";
  if (itemId.startsWith("fossil.") || itemId.startsWith("own.")) return "drill";
  if (itemId.startsWith("lesson.")) return "lesson";
  if (itemId.startsWith("ex.") || itemId.startsWith("card.")) return "sentence";
  return "other";
}

/**
 * Adds a take. Returns the new index and the takes it pushed out (the oldest
 * of that item past MAX_TAKES_PER_ITEM, then the oldest overall past
 * MAX_RECORDINGS), whose files the store must delete.
 */
export function addRecording(index: RecordingIndex, recording: Recording, limits: { perItem?: number; total?: number } = {}): { index: RecordingIndex; evicted: Recording[] } {
  if (!isRecording(recording)) throw new Error("Not a valid recording.");
  const perItem = limits.perItem ?? MAX_TAKES_PER_ITEM;
  const total = limits.total ?? MAX_RECORDINGS;
  let items = [...index.items.filter((r) => r.id !== recording.id), recording].sort((a, b) => a.createdAt - b.createdAt);
  const evicted: Recording[] = [];
  const same = items.filter((r) => r.itemId === recording.itemId);
  if (same.length > perItem) {
    const drop = new Set(same.slice(0, same.length - perItem).map((r) => r.id));
    evicted.push(...items.filter((r) => drop.has(r.id)));
    items = items.filter((r) => !drop.has(r.id));
  }
  if (items.length > total) {
    evicted.push(...items.slice(0, items.length - total));
    items = items.slice(items.length - total);
  }
  return { index: { format: 1, items }, evicted };
}

export function removeRecordings(index: RecordingIndex, ids: readonly string[]): { index: RecordingIndex; removed: Recording[] } {
  const drop = new Set(ids);
  return { index: { format: 1, items: index.items.filter((r) => !drop.has(r.id)) }, removed: index.items.filter((r) => drop.has(r.id)) };
}

export function updateRecording(index: RecordingIndex, id: string, patch: Partial<Pick<Recording, "icloud" | "score">>): RecordingIndex {
  return { format: 1, items: index.items.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/** Takes of one item, newest first. */
export function takesFor(index: RecordingIndex, itemId: string): Recording[] {
  return index.items.filter((r) => r.itemId === itemId).sort((a, b) => b.createdAt - a.createdAt);
}

export interface ItemGroup {
  itemId: string;
  kind: RecordingKind;
  text: string;
  takes: Recording[];
  lastAt: number;
}

/** The library by item: most recently practised first, each item's takes newest first. */
export function groupByItem(index: RecordingIndex): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  for (const r of index.items) {
    const group = groups.get(r.itemId) ?? { itemId: r.itemId, kind: r.kind, text: r.text, takes: [], lastAt: 0 };
    group.takes.push(r);
    if (r.createdAt >= group.lastAt) {
      group.lastAt = r.createdAt;
      group.text = r.text;
    }
    groups.set(r.itemId, group);
  }
  for (const group of groups.values()) group.takes.sort((a, b) => b.createdAt - a.createdAt);
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt || (a.itemId < b.itemId ? -1 : 1));
}

export interface DayGroup {
  /** Local day, from the caller's `dayOf`. */
  day: string;
  takes: Recording[];
}

/** The library by date, newest day first. `dayOf` turns epoch ms into the learner's local day. */
export function groupByDay(index: RecordingIndex, dayOf: (ms: number) => string): DayGroup[] {
  const days = new Map<string, Recording[]>();
  for (const r of [...index.items].sort((a, b) => b.createdAt - a.createdAt)) {
    const day = dayOf(r.createdAt);
    days.set(day, [...(days.get(day) ?? []), r]);
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, takes]) => ({ day, takes }));
}

export function filterIndex(index: RecordingIndex, filter: { kind?: RecordingKind; query?: string }): RecordingIndex {
  const q = (filter.query ?? "").trim().toLowerCase();
  return {
    format: 1,
    items: index.items.filter((r) => (!filter.kind || r.kind === filter.kind || (filter.kind === "drill" && r.kind === "fossil")) && (!q || r.text.toLowerCase().includes(q) || r.itemId.includes(q))),
  };
}

export function totals(index: RecordingIndex): { takes: number; items: number; bytes: number; durationMs: number } {
  return {
    takes: index.items.length,
    items: new Set(index.items.map((r) => r.itemId)).size,
    bytes: index.items.reduce((n, r) => n + r.bytes, 0),
    durationMs: index.items.reduce((n, r) => n + r.durationMs, 0),
  };
}

/** What a Plus account syncs about its recordings: never audio, never file names. */
export interface RecordingMeta {
  id: string;
  itemId: string;
  kind: RecordingKind;
  text: string;
  createdAt: number;
  durationMs: number;
  score?: number;
  /** Which device holds the audio. */
  device: string;
}

export const MAX_SYNCED_META = 500;

export function metadataForSync(index: RecordingIndex, device: string): RecordingMeta[] {
  return index.items
    .slice(-MAX_SYNCED_META)
    .map((r) => ({ id: r.id, itemId: r.itemId, kind: r.kind, text: r.text.slice(0, 240), createdAt: r.createdAt, durationMs: r.durationMs, ...(typeof r.score === "number" ? { score: r.score } : {}), device: device.slice(0, 64) }));
}

/** Merges metadata from several devices, one record per id, newest MAX_SYNCED_META kept. */
export function mergeMeta(current: readonly RecordingMeta[], incoming: readonly RecordingMeta[], removedIds: readonly string[] = []): RecordingMeta[] {
  const drop = new Set(removedIds);
  const byId = new Map<string, RecordingMeta>();
  for (const m of [...current, ...incoming]) if (!drop.has(m.id)) byId.set(m.id, m);
  const all = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
  return all.slice(Math.max(0, all.length - MAX_SYNCED_META));
}

export function isRecordingMeta(value: unknown): value is RecordingMeta {
  if (!value || typeof value !== "object") return false;
  const m = value as RecordingMeta;
  return (
    typeof m.id === "string" && ID.test(m.id) &&
    typeof m.itemId === "string" && ITEM.test(m.itemId) &&
    (RECORDING_KINDS as readonly string[]).includes(m.kind) &&
    typeof m.text === "string" && m.text.length <= 240 &&
    Number.isFinite(m.createdAt) && Number.isFinite(m.durationMs) &&
    (m.score === undefined || (Number.isFinite(m.score) && m.score >= 0 && m.score <= 100)) &&
    typeof m.device === "string" && m.device.length <= 64
  );
}

/** "0:07", "1:02". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "320 KB", "4.1 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A readable export file name: "cadence-raise-a-concern-2026-10-24.m4a". */
export function exportName(recording: Recording, day: string): string {
  const slug = recording.text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || "take";
  return `cadence-${slug}-${day}.${recording.file.split(".").pop()}`;
}
