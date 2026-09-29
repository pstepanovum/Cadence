import { Directory, File, Paths } from "expo-file-system";
import { referenceAudioUrl } from "@/api/endpoints";

const CACHE_DIR = "reference-audio";

/**
 * A wav header alone is 44 bytes; anything at or under this is either empty or
 * the route's JSON error body written to disk under a .wav name. Caching one of
 * those would poison that target word forever, so it gets deleted instead.
 */
const MIN_AUDIO_BYTES = 128;

/** Keep the cache bounded — it is generated audio and cheap to fetch again. */
const MAX_CACHED_CLIPS = 240;

export class ReferenceAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceAudioError";
  }
}

function cacheKey(text: string, instruct?: string): string {
  const input = `${instruct ?? ""}:${text}`;
  // djb2 — stable, tiny, good enough for a filename cache key.
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function cacheDirectory(): Directory {
  const directory = new Directory(Paths.cache, CACHE_DIR);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

/** Best-effort: a file we cannot delete is not worth failing a lesson over. */
function discard(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Ignore — the next download overwrites it anyway.
  }
}

/**
 * Returns a local file URI for the TTS rendering of `text`, downloading it once
 * and caching it afterwards (generation is expensive server-side).
 *
 * `/api/reference-audio` answers with audio bytes on success but a JSON
 * `{error}` body on failure, and the downloader is happy to write either, so
 * what comes back is checked before it is trusted or cached.
 */
export async function getReferenceAudio(text: string, instruct?: string): Promise<string> {
  const target = text.trim();
  if (!target) {
    throw new ReferenceAudioError("There is nothing to pronounce here yet.");
  }

  const file = new File(cacheDirectory(), `${cacheKey(target, instruct)}.wav`);

  if (file.exists && file.size > MIN_AUDIO_BYTES) {
    return file.uri;
  }
  discard(file);

  let downloaded: File;
  try {
    downloaded = await File.downloadFileAsync(referenceAudioUrl(target, instruct), file, {
      idempotent: true,
    });
  } catch {
    throw new ReferenceAudioError(
      "Could not reach Cadence to load the reference audio. Check your connection and try again.",
    );
  }

  if (!downloaded.exists || downloaded.size <= MIN_AUDIO_BYTES) {
    // Read the body back before deleting it: when the route fails it explains
    // why in JSON, and that beats a generic message.
    let detail: string | null = null;
    try {
      const parsed = JSON.parse(await downloaded.text()) as { error?: string };
      detail = typeof parsed.error === "string" ? parsed.error : null;
    } catch {
      // Not JSON, or unreadable — fall through to the generic message.
    }
    discard(downloaded);
    throw new ReferenceAudioError(
      detail ?? "The reference pronunciation could not be generated. Try again in a moment.",
    );
  }

  return downloaded.uri;
}

/**
 * Warms the cache without surfacing failures, so that a "Hear target" tap is
 * instant. Mirrors the web app, which pre-fetches theory narration shortly
 * after the lesson mounts.
 */
export function prefetchReferenceAudio(text: string, instruct?: string): void {
  getReferenceAudio(text, instruct).catch(() => {
    // A cold cache just means the button takes a moment; never surface this.
  });
}

/**
 * Drops every cached clip. Called when the coach voice changes: the filenames
 * are keyed by voice so stale entries are never served by mistake, but they are
 * dead weight the moment the learner picks a different voice.
 */
export function clearReferenceAudioCache(): void {
  try {
    const directory = new Directory(Paths.cache, CACHE_DIR);
    if (directory.exists) directory.delete();
  } catch {
    // Ignore — worst case the old clips linger until the OS clears the cache.
  }
}

/** Trims the cache when it grows past the cap. Safe to call on every launch. */
export function pruneReferenceAudioCache(): void {
  try {
    const clips = cacheDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File);
    if (clips.length <= MAX_CACHED_CLIPS) return;
    for (const clip of clips.slice(0, clips.length - MAX_CACHED_CLIPS)) {
      discard(clip);
    }
  } catch {
    // Ignore — pruning is housekeeping, never worth an error to the learner.
  }
}
