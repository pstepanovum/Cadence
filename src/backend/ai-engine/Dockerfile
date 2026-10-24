# syntax=docker/dockerfile:1.7
#
# The ai-engine for your own Cadence (docker-compose, `pnpm serve`): scoring,
# transcription and OmniVoice reference audio, models downloaded on first use
# into the hf-cache volume. Built from src/backend so the shared data/ folder
# (IPA narration, voices) sits next to the code, where reference_tts.py
# expects it. The hosted cloud image is Dockerfile.cloud.

FROM python:3.10-slim

WORKDIR /app/ai-engine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/huggingface \
    TRANSFORMERS_CACHE=/models/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    espeak-ng \
    libsndfile1 \
    git \
  && rm -rf /var/lib/apt/lists/*

COPY ai-engine/requirements.txt ./

RUN pip install --upgrade pip setuptools wheel && \
    pip install -r requirements.txt

COPY ai-engine/main.py ai-engine/phoneme_scorer.py ai-engine/reference_tts.py ai-engine/speech_transcriber.py ./
COPY data /app/data

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser && \
    mkdir -p /models/huggingface && \
    chown -R appuser:appgroup /app /models

USER appuser

EXPOSE 8000

CMD ["python", "main.py"]
