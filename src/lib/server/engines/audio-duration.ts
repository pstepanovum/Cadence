// FILE: src/lib/server/engines/audio-duration.ts
//
// Real playing time of an upload, read from the container the way a decoder
// would read it, without decoding. The cloud transcriber hands the bytes to a
// provider that never tells us how long they were, so these numbers are what
// the 30-second cap and the daily audio quota are charged on.
//
// Every figure here comes from the fields a decoder actually obeys (the WAV
// sample rate and block size, each Opus packet's own frame count, each MP3
// frame header, the MP4 sample tables), never from a summary field a client
// could set to anything (the WAV byte rate, the Matroska Duration, an Ogg
// granule on its own). Anything that cannot be read is null, and the caller
// refuses it.
import type { AudioContainer } from "../../platform/engine-routing";

function ascii(bytes: Uint8Array, start: number, length: number) {
  let out = "";
  for (let i = 0; i < length && start + i < bytes.length; i += 1) out += String.fromCharCode(bytes[start + i]);
  return out;
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// WAV -----------------------------------------------------------------------

export type WavFormat = { format: number; channels: number; sampleRate: number; byteRate: number; blockAlign: number; bitsPerSample: number };

/**
 * WAV seconds from the sample rate and block size. The header's byteRate is
 * a derived field nobody decodes with, so a file whose byteRate disagrees
 * with sampleRate * blockAlign is refused (null) rather than believed.
 */
export function wavDuration(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  const data = view(bytes);
  let offset = 12;
  let fmt: WavFormat | null = null;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = data.getUint32(offset + 4, true);
    if (id === "fmt ") {
      if (size < 16 || offset + 24 > bytes.length) return null;
      fmt = {
        format: data.getUint16(offset + 8, true),
        channels: data.getUint16(offset + 10, true),
        sampleRate: data.getUint32(offset + 12, true),
        byteRate: data.getUint32(offset + 16, true),
        blockAlign: data.getUint16(offset + 20, true),
        bitsPerSample: data.getUint16(offset + 22, true),
      };
    }
    if (id === "data") {
      if (!fmt) return null;
      const { channels, sampleRate, byteRate, blockAlign, bitsPerSample } = fmt;
      if (channels < 1 || channels > 8 || sampleRate < 4000 || sampleRate > 192000) return null;
      if (bitsPerSample < 8 || bitsPerSample > 64 || blockAlign !== channels * Math.ceil(bitsPerSample / 8)) return null;
      if (byteRate !== sampleRate * blockAlign) return null;
      const dataBytes = Math.min(size, bytes.length - offset - 8);
      return dataBytes / (sampleRate * blockAlign);
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

// Opus ----------------------------------------------------------------------

const SILK_MS = [10, 20, 40, 60];
const CELT_MS = [2.5, 5, 10, 20];

/** Seconds of audio in one Opus packet, from its TOC byte (RFC 6716 3.1). */
export function opusPacketSeconds(packet: Uint8Array, offset = 0, length = packet.length - offset): number | null {
  if (length < 1) return 0;
  const toc = packet[offset];
  const config = toc >> 3;
  const frameMs = config < 12 ? SILK_MS[config % 4] : config < 16 ? (config % 2 === 0 ? 10 : 20) : CELT_MS[config % 4];
  const code = toc & 0x03;
  let frames = code === 0 ? 1 : code === 3 ? -1 : 2;
  if (code === 3) {
    if (length < 2) return null;
    frames = packet[offset + 1] & 0x3f;
  }
  const ms = frames * frameMs;
  return ms > 120 ? null : ms / 1000;
}

// Ogg -----------------------------------------------------------------------

/** Ogg Opus: every packet's own duration, summed. Other Ogg codecs are null. */
export function oggOpusDuration(bytes: Uint8Array): number | null {
  let offset = 0;
  let seconds = 0;
  let packetIndex = 0;
  const chunks: Uint8Array[] = [];
  let pending = 0;
  const finishPacket = () => {
    const packet = pending === 1 ? chunks[0] : concat(chunks, pending);
    chunks.length = 0;
    pending = 0;
    return packet;
  };
  while (offset + 27 <= bytes.length) {
    if (ascii(bytes, offset, 4) !== "OggS") return null;
    const segments = bytes[offset + 26];
    const tableStart = offset + 27;
    let body = tableStart + segments;
    if (body > bytes.length) return null;
    for (let s = 0; s < segments; s += 1) {
      const lace = bytes[tableStart + s];
      if (body + lace > bytes.length) return null;
      chunks.push(bytes.subarray(body, body + lace));
      pending += 1;
      body += lace;
      if (lace < 255) {
        const packet = finishPacket();
        if (packetIndex === 0) {
          if (ascii(packet, 0, 8) !== "OpusHead") return null;
        } else if (packetIndex > 1) {
          const packetSeconds = opusPacketSeconds(packet);
          if (packetSeconds === null) return null;
          seconds += packetSeconds;
        }
        packetIndex += 1;
      }
    }
    offset = body;
  }
  return packetIndex >= 2 ? seconds : null;
}

function concat(chunks: Uint8Array[], count: number) {
  let length = 0;
  for (let i = 0; i < count; i += 1) length += chunks[i].length;
  const out = new Uint8Array(length);
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    out.set(chunks[i], at);
    at += chunks[i].length;
  }
  return out;
}

// WebM (Matroska) -------------------------------------------------------------

const EBML_SEGMENT = 0x18538067;
const EBML_CLUSTER = 0x1f43b675;
const EBML_BLOCK_GROUP = 0xa0;
const EBML_BLOCK = 0xa1;
const EBML_SIMPLE_BLOCK = 0xa3;
const EBML_TRACKS = 0x1654ae6b;
const EBML_TRACK_ENTRY = 0xae;
const EBML_CODEC_ID = 0x86;
/** Masters whose children are walked in place, so unknown sizes (live recordings) work. */
const EBML_ENTER = new Set([EBML_SEGMENT, EBML_CLUSTER, EBML_BLOCK_GROUP, EBML_TRACKS, EBML_TRACK_ENTRY]);

type Vint = { value: number; length: number; unknown: boolean };

function readVint(bytes: Uint8Array, offset: number, keepMarker: boolean): Vint | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length += 1;
  if (length > 8 || offset + length > bytes.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[offset + i];
    if (bytes[offset + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

/** Opus frames inside one Matroska block payload, honouring the three lacing kinds. */
function blockSeconds(bytes: Uint8Array, start: number, end: number): number | null {
  const track = readVint(bytes, start, false);
  if (!track) return null;
  let at = start + track.length + 3;
  if (at > end) return null;
  const lacing = (bytes[at - 1] >> 1) & 0x03;
  const sizes: number[] = [];
  if (lacing === 0) {
    sizes.push(end - at);
  } else {
    const count = bytes[at] + 1;
    at += 1;
    if (lacing === 2) {
      const each = Math.floor((end - at) / count);
      for (let i = 0; i < count; i += 1) sizes.push(each);
    } else if (lacing === 1) {
      for (let i = 0; i < count - 1; i += 1) {
        let size = 0;
        while (at < end && bytes[at] === 255) {
          size += 255;
          at += 1;
        }
        if (at >= end) return null;
        size += bytes[at];
        at += 1;
        sizes.push(size);
      }
    } else {
      const firstSize = readVint(bytes, at, false);
      if (!firstSize) return null;
      at += firstSize.length;
      sizes.push(firstSize.value);
      for (let i = 1; i < count - 1; i += 1) {
        const delta = readVint(bytes, at, false);
        if (!delta) return null;
        at += delta.length;
        const bias = 2 ** (7 * delta.length - 1) - 1;
        sizes.push(sizes[i - 1] + (delta.value - bias));
      }
    }
    if (lacing !== 2) {
      const used = sizes.reduce((sum, size) => sum + size, 0);
      sizes.push(end - at - used);
    }
  }
  let seconds = 0;
  for (const size of sizes) {
    if (size < 0 || at + size > end) return null;
    const frame = opusPacketSeconds(bytes, at, size);
    if (frame === null) return null;
    seconds += frame;
    at += size;
  }
  return seconds;
}

/** WebM with an Opus track: every block's packets, summed. Other codecs are null. */
export function webmOpusDuration(bytes: Uint8Array): number | null {
  let offset = 0;
  let seconds = 0;
  let blocks = 0;
  let codecs = 0;
  while (offset < bytes.length) {
    const id = readVint(bytes, offset, true);
    if (!id) break;
    const size = readVint(bytes, offset + id.length, false);
    if (!size) break;
    const bodyStart = offset + id.length + size.length;
    if (EBML_ENTER.has(id.value)) {
      offset = bodyStart;
      continue;
    }
    if (size.unknown) return null;
    const bodyEnd = bodyStart + size.value;
    if (bodyEnd > bytes.length) {
      // A recording cut mid-block: count what is there.
      if (id.value === EBML_SIMPLE_BLOCK || id.value === EBML_BLOCK) break;
      return null;
    }
    if (id.value === EBML_CODEC_ID) {
      if (ascii(bytes, bodyStart, size.value) !== "A_OPUS") return null;
      codecs += 1;
    } else if (id.value === EBML_SIMPLE_BLOCK || id.value === EBML_BLOCK) {
      const blockTime = blockSeconds(bytes, bodyStart, bodyEnd);
      if (blockTime === null) return null;
      seconds += blockTime;
      blocks += 1;
    }
    offset = bodyEnd;
  }
  return codecs > 0 && blocks > 0 ? seconds : null;
}

// MP4 -----------------------------------------------------------------------

const MP4_ENTER = new Set(["moov", "trak", "mdia", "minf", "stbl", "moof", "traf"]);
/** AAC frames carry 1024 samples (HE-AAC more) at no more than 96 kHz. */
const AAC_SAMPLES_PER_FRAME = 1024;
const AAC_MAX_RATE = 96000;

/**
 * MP4 / M4A with AAC audio. The sample tables give the time a player shows;
 * the sample count gives a floor no table can shrink, because every AAC frame
 * holds at least 1024 samples at no more than 96 kHz. The larger one counts.
 */
export function mp4AacDuration(bytes: Uint8Array): number | null {
  const data = view(bytes);
  let offset = 0;
  let end = bytes.length;
  const stack: number[] = [];
  let timescale = 0;
  let sampleRate = 0;
  let tableTicks = 0;
  let samples = 0;
  let aac = false;
  while (true) {
    while (stack.length && offset >= end) {
      end = stack.pop() as number;
    }
    if (offset + 8 > end) break;
    let size = data.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return null;
      size = Number(data.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return null;
    const body = offset + header;
    const boxEnd = offset + size;
    if (MP4_ENTER.has(type)) {
      stack.push(end);
      end = boxEnd;
      offset = body;
      continue;
    }
    if (type === "mdhd") {
      const version = bytes[body];
      timescale = data.getUint32(body + (version === 1 ? 20 : 12));
    } else if (type === "stsd") {
      // One AudioSampleEntry: 8-byte box header after the 8-byte stsd header.
      const entry = body + 8;
      if (entry + 36 <= boxEnd) {
        aac = aac || ascii(bytes, entry + 4, 4) === "mp4a";
        sampleRate = Math.max(sampleRate, data.getUint32(entry + 32) >>> 16);
      }
    } else if (type === "stts") {
      const count = data.getUint32(body + 4);
      if (body + 8 + count * 8 > boxEnd) return null;
      for (let i = 0; i < count; i += 1) tableTicks += data.getUint32(body + 8 + i * 8) * data.getUint32(body + 12 + i * 8);
    } else if (type === "stsz") {
      samples += data.getUint32(body + 8);
    } else if (type === "trun") {
      samples += data.getUint32(body + 4);
    }
    offset = boxEnd;
  }
  if (!aac || samples === 0) return null;
  const floor = (samples * AAC_SAMPLES_PER_FRAME) / AAC_MAX_RATE;
  const fromTables = timescale > 0 ? tableTicks / timescale : 0;
  const fromEntryRate = sampleRate >= 8000 && sampleRate <= AAC_MAX_RATE ? (samples * AAC_SAMPLES_PER_FRAME) / sampleRate : 0;
  return Math.max(floor, fromTables, fromEntryRate);
}

// MP3 -----------------------------------------------------------------------

const MP3_BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

/** MP3 (Layer III): every frame header walked in turn. */
export function mp3Duration(bytes: Uint8Array): number | null {
  let offset = 0;
  if (ascii(bytes, 0, 3) === "ID3" && bytes.length >= 10) {
    offset = 10 + (((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f));
  }
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      if (ascii(bytes, offset, 3) === "TAG") break;
      return frames > 0 ? seconds : null;
    }
    const version = (bytes[offset + 1] >> 3) & 0x03;
    const layer = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const rateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
    const bitrate = (version === 3 ? MP3_BITRATES.v1 : MP3_BITRATES.v2)[bitrateIndex] * 1000;
    const rate = MP3_RATES[version][rateIndex];
    const samplesPerFrame = version === 3 ? 1152 : 576;
    const length = Math.floor(((samplesPerFrame / 8) * bitrate) / rate) + padding;
    if (length < 4) return null;
    seconds += samplesPerFrame / rate;
    frames += 1;
    offset += length;
  }
  return frames > 0 ? seconds : null;
}

/** Playing time in seconds, or null when the container cannot be read. */
export function audioDuration(bytes: Uint8Array, container: AudioContainer): number | null {
  switch (container) {
    case "wav":
      return wavDuration(bytes);
    case "ogg":
      return oggOpusDuration(bytes);
    case "webm":
      return webmOpusDuration(bytes);
    case "mp4":
      return mp4AacDuration(bytes);
    case "mp3":
      return mp3Duration(bytes);
  }
}
