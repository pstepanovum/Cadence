# FILE: src/backend/ai-engine/audio_limits.py
#
# What the engine accepts as a recording, checked before anything decodes it:
# at most AUDIO_MAX_BYTES (2 MB) and AUDIO_MAX_SECONDS (30 s), and only a real
# audio container recognised from its first bytes, whatever the declared
# content type says. The same rules as src/lib/platform/engine-routing.ts
# (sniffAudio) and src/lib/server/engines/audio.ts, so the web server and the
# engine refuse the same uploads. Pure: no model, no decoder.
from __future__ import annotations

import os
import struct


def _env_number(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, "").strip() or default)
    except ValueError:
        return default
    return value if value > 0 else default


AUDIO_MAX_SECONDS = _env_number("CADENCE_AUDIO_MAX_SECONDS", 30)
AUDIO_MAX_BYTES = int(_env_number("CADENCE_AUDIO_MAX_BYTES", 2 * 1024 * 1024))

# Compressed speech at 64 kbps or less, so this estimate never undercounts by much.
COMPRESSED_BYTES_PER_SECOND = 8000


class AudioRejected(ValueError):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def sniff_audio(data: bytes) -> str | None:
    """The container the bytes really are, or None for anything else."""
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[4:8] == b"ftyp":
        return "mp4"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    if data[:4] == b"OggS":
        return "ogg"
    if data[:3] == b"ID3" or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return "mp3"
    return None


def wav_seconds(data: bytes) -> float | None:
    """WAV duration from its header (data bytes over byte rate); None when unusual."""
    if len(data) < 44:
        return None
    offset = 12
    byte_rate = 0
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        (size,) = struct.unpack_from("<I", data, offset + 4)
        if chunk_id == b"fmt " and offset + 16 <= len(data):
            (byte_rate,) = struct.unpack_from("<I", data, offset + 16)
        if chunk_id == b"data":
            if not byte_rate:
                return None
            return min(size, len(data) - offset - 8) / byte_rate
        offset += 8 + size + (size % 2)
    return None


def estimate_seconds(data: bytes, container: str) -> float:
    if container == "wav":
        exact = wav_seconds(data)
        return exact if exact is not None else len(data) / 32000
    # A cap, not a measurement: compressed audio is measured exactly once
    # decoded (check_decoded_seconds), so the estimate alone never refuses it.
    return min(AUDIO_MAX_SECONDS, len(data) / COMPRESSED_BYTES_PER_SECOND)


def check_audio(data: bytes) -> str:
    """Returns the sniffed container, or raises AudioRejected with an HTTP status."""
    if not data:
        raise AudioRejected(400, "audio_missing", "Audio upload is empty.")
    if len(data) > AUDIO_MAX_BYTES:
        raise AudioRejected(413, "audio_too_large", "That recording is too large. Keep it under 30 seconds.")
    container = sniff_audio(data)
    if container is None:
        raise AudioRejected(415, "audio_unsupported", "That recording isn't a supported audio format.")
    if estimate_seconds(data, container) > AUDIO_MAX_SECONDS + 0.5:
        raise AudioRejected(413, "audio_too_long", f"Keep recordings under {AUDIO_MAX_SECONDS:g} seconds.")
    return container


def check_decoded_seconds(sample_count: int, sample_rate: int) -> None:
    """The exact length once decoded, for containers the header cannot measure."""
    if sample_rate > 0 and sample_count / sample_rate > AUDIO_MAX_SECONDS + 0.5:
        raise AudioRejected(413, "audio_too_long", f"Keep recordings under {AUDIO_MAX_SECONDS:g} seconds.")
