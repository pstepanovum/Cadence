# FILE: src/backend/ai-engine/tests/test_endpoints.py
#
# /assess and /transcribe refuse bad uploads before any model sees them. The
# model modules are replaced with stubs, so this runs without PyTorch.
import struct
import sys
import types

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
pytest.importorskip("multipart")


class _Stub:
    model_loaded = True
    load_error = None

    def __init__(self, *args, **kwargs):
        self.calls = 0

    def warmup(self, force=False):
        return None

    def get_status(self):
        return {"ttsReady": True}

    def get_diagnostics(self):
        return {}

    def assess(self, audio_bytes, target_text, filename=None):
        self.calls += 1
        return {"overallScore": 90}

    def transcribe(self, audio_bytes, filename=None):
        self.calls += 1
        return {"transcript": "hello"}


@pytest.fixture(scope="module")
def client():
    saved = {name: sys.modules.get(name) for name in ("phoneme_scorer", "reference_tts", "speech_transcriber", "main")}
    sys.modules["phoneme_scorer"] = types.SimpleNamespace(MODEL_NAME="stub", PhonemeScorer=_Stub)
    sys.modules["reference_tts"] = types.SimpleNamespace(ReferenceSpeechSynthesizer=_Stub)
    sys.modules["speech_transcriber"] = types.SimpleNamespace(SpeechTranscriber=_Stub)
    sys.modules.pop("main", None)
    import main
    from fastapi.testclient import TestClient

    yield TestClient(main.app), main
    for name, module in saved.items():
        if module is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = module


def wav(seconds: float, rate: int = 8000) -> bytes:
    data = b"\x00\x00" * int(seconds * rate)
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)
    return b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE" + b"fmt " + struct.pack("<I", 16) + fmt + b"data" + struct.pack("<I", len(data)) + data


@pytest.mark.parametrize("path", ["/assess", "/transcribe"])
def test_refuses_bad_uploads_before_the_model(client, path):
    http, main = client
    form = {"text": "think"} if path == "/assess" else {}
    cases = [
        (b"", "audio/wav", 400),
        (b"<html>not audio</html>", "audio/wav", 415),
        (wav(40), "audio/wav", 413),
        (b"RIFF" + b"\x00" * (2 * 1024 * 1024 + 10), "audio/wav", 413),
    ]
    model = main.scorer if path == "/assess" else main.speech_transcriber
    before = model.calls
    for body, mime, status in cases:
        response = http.post(path, files={"audio": ("clip.wav", body, mime)}, data=form)
        assert response.status_code == status, (path, status, response.text)
    assert model.calls == before, "a refused upload never reaches the model"


def test_accepts_a_short_clip_whatever_type_it_claims(client):
    http, _ = client
    response = http.post("/transcribe", files={"audio": ("clip.txt", wav(2), "text/plain")})
    assert response.status_code == 200
    assert response.json()["transcript"] == "hello"
