// FILE: src/lib/server/engines/audio.ts
//
// Audio uploads: at most AUDIO_MAX_BYTES (2 MB) and AUDIO_MAX_SECONDS (30 s),
// the container sniffed from the bytes (sniffAudio) rather than taken from the
// declared type, held in memory only and never written anywhere.
import { AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, sniffAudio, type AudioContainer } from "../../platform/engine-routing";

export interface AudioUpload {
  bytes: Uint8Array;
  container: AudioContainer;
  mimeType: string;
  filename: string;
  /** Exact for WAV, a conservative estimate for compressed formats. */
  seconds: number;
}

export type AudioCheck = { ok: true; audio: AudioUpload } | { ok: false; status: number; error: string; message: string };

const MIME: Record<AudioContainer, string> = { wav: "audio/wav", mp4: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg" };
const EXT: Record<AudioContainer, string> = { wav: "wav", mp4: "m4a", webm: "webm", ogg: "ogg", mp3: "mp3" };

/** WAV duration from its header: data bytes over byte rate. Null when the header is unusual. */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 16 <= bytes.length) byteRate = view.getUint32(offset + 16, true);
    if (id === "data") {
      if (!byteRate) return null;
      const dataBytes = Math.min(size, bytes.length - offset - 8);
      return dataBytes / byteRate;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Compressed speech at 64 kbps or less: estimating at 64 kbps never undercounts by much. */
const COMPRESSED_BYTES_PER_SECOND = 8000;

export function estimateSeconds(bytes: Uint8Array, container: AudioContainer): number {
  if (container === "wav") return wavSeconds(bytes) ?? bytes.length / 32000;
  return Math.min(AUDIO_MAX_SECONDS, bytes.length / COMPRESSED_BYTES_PER_SECOND);
}

export function checkAudio(bytes: Uint8Array, filename = "attempt"): AudioCheck {
  if (bytes.length === 0) return { ok: false, status: 400, error: "audio_missing", message: "An audio recording is required." };
  if (bytes.length > AUDIO_MAX_BYTES) return { ok: false, status: 413, error: "audio_too_large", message: "That recording is too large. Keep it under 30 seconds." };
  const container = sniffAudio(bytes);
  if (!container) return { ok: false, status: 415, error: "audio_unsupported", message: "That recording isn't a supported audio format." };
  const seconds = estimateSeconds(bytes, container);
  if (seconds > AUDIO_MAX_SECONDS + 0.5) return { ok: false, status: 413, error: "audio_too_long", message: `Keep recordings under ${AUDIO_MAX_SECONDS} seconds.` };
  const base = filename.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "attempt";
  return { ok: true, audio: { bytes, container, mimeType: MIME[container], filename: `${base}.${EXT[container]}`, seconds: Math.max(1, Math.ceil(seconds)) } };
}

/** Reads the `audio` field of a multipart form and checks it. */
export async function readAudioField(form: FormData | null, field = "audio"): Promise<AudioCheck> {
  const value = form?.get(field);
  if (!(value instanceof File)) return { ok: false, status: 400, error: "audio_missing", message: "An audio recording is required." };
  if (value.size > AUDIO_MAX_BYTES) return { ok: false, status: 413, error: "audio_too_large", message: "That recording is too large. Keep it under 30 seconds." };
  return checkAudio(new Uint8Array(await value.arrayBuffer()), value.name || "attempt");
}

export function audioBlob(audio: AudioUpload): Blob {
  const copy = audio.bytes.slice().buffer as ArrayBuffer;
  return new Blob([copy], { type: audio.mimeType });
}
