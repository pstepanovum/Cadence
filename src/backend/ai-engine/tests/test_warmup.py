# FILE: src/backend/ai-engine/tests/test_warmup.py
#
# A request that arrives while the background warmup is loading waits for that
# load instead of starting a second copy of the model. Runs without PyTorch:
# the load itself is replaced.
import threading
import time

import pytest

pytest.importorskip("numpy")
pytest.importorskip("soundfile")


def test_concurrent_warmups_load_the_model_once(monkeypatch):
    import speech_transcriber

    transcriber = speech_transcriber.SpeechTranscriber()
    loads = []

    def fake_load():
        loads.append(1)
        time.sleep(0.05)
        transcriber.model_loaded = True

    monkeypatch.setattr(transcriber, "_load", fake_load)
    threads = [threading.Thread(target=transcriber.warmup, kwargs={"force": i == 0}) for i in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert len(loads) == 1
