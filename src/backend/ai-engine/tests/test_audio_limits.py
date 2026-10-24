# FILE: src/backend/ai-engine/tests/test_audio_limits.py
#
# The upload rules (audio_limits.py): size, length and container, checked on
# the bytes rather than the declared type. Pure, so no model is loaded.
import struct

import pytest

from audio_limits import (
    AUDIO_MAX_BYTES,
    AUDIO_MAX_SECONDS,
    AudioRejected,
    check_audio,
    check_decoded_seconds,
    sniff_audio,
    wav_seconds,
)


def wav(seconds: float, rate: int = 16000) -> bytes:
    samples = int(seconds * rate)
    data = b"\x00\x00" * samples
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)
    return b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", len(data)) + data


def rejected(data: bytes) -> AudioRejected:
    with pytest.raises(AudioRejected) as caught:
        check_audio(data)
    return caught.value


def test_limits_match_the_web_server():
    assert AUDIO_MAX_SECONDS == 30
    assert AUDIO_MAX_BYTES == 2 * 1024 * 1024


def test_accepts_a_short_wav_and_measures_it():
    clip = wav(3)
    assert check_audio(clip) == "wav"
    assert wav_seconds(clip) == pytest.approx(3)


def test_refuses_empty_audio():
    error = rejected(b"")
    assert (error.status, error.code) == (400, "audio_missing")


def test_refuses_more_than_two_megabytes_whatever_it_is():
    error = rejected(b"RIFF" + b"\x00" * AUDIO_MAX_BYTES)
    assert (error.status, error.code) == (413, "audio_too_large")


def test_refuses_a_wav_longer_than_thirty_seconds():
    # 8 kHz keeps 40 s under the size cap, so length is what refuses it.
    error = rejected(wav(40, rate=8000))
    assert (error.status, error.code) == (413, "audio_too_long")


def test_refuses_what_is_not_audio_by_its_bytes_not_its_name():
    for data in (b"<html><body>hi</body></html>", b"%PDF-1.7 ...", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, b"just text"):
        error = rejected(data)
        assert (error.status, error.code) == (415, "audio_unsupported")


def test_recognises_the_containers_phones_and_browsers_record():
    assert sniff_audio(b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 16) == "mp4"
    assert sniff_audio(b"\x1a\x45\xdf\xa3" + b"\x00" * 16) == "webm"
    assert sniff_audio(b"OggS" + b"\x00" * 16) == "ogg"
    assert sniff_audio(b"ID3" + b"\x00" * 16) == "mp3"
    assert sniff_audio(b"\xff\xfb\x90\x00") == "mp3"


def test_compressed_audio_is_measured_once_decoded():
    # A 300 KB m4a passes the byte checks; its real length is checked after decoding.
    assert check_audio(b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 300_000) == "mp4"
    check_decoded_seconds(16000 * 30, 16000)
    with pytest.raises(AudioRejected) as caught:
        check_decoded_seconds(16000 * 45, 16000)
    assert caught.value.status == 413
