# FILE: scripts/bench/whisper_cpu.py
#
# The Whisper-on-CPU half of scripts/bench/transcribe.mjs: transcribes each
# WAV named on the command line with a Hugging Face Whisper checkpoint on the
# CPU, limited to the thread count cadence-ai gets on Cloud Run (2 vCPU), and
# prints one JSON line per clip: {"file", "text", "seconds"}. The model load is
# reported separately so it is not counted against any clip.
import json
import sys
import time

import torch
from transformers import pipeline


def main() -> None:
    model = sys.argv[1]
    threads = int(sys.argv[2])
    files = sys.argv[3:]
    torch.set_num_threads(threads)
    started = time.perf_counter()
    asr = pipeline("automatic-speech-recognition", model=model, device="cpu")
    print(json.dumps({"load_seconds": round(time.perf_counter() - started, 2)}), flush=True)
    for path in files:
        started = time.perf_counter()
        result = asr(path, generate_kwargs={"language": "en", "task": "transcribe"} if not model.endswith(".en") else None)
        print(json.dumps({"file": path, "text": result["text"].strip(), "seconds": round(time.perf_counter() - started, 3)}), flush=True)


if __name__ == "__main__":
    main()
