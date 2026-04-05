# FILE: src/ai-engine/main.py
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from threading import Lock, Thread
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from phoneme_scorer import MODEL_NAME, PhonemeScorer
from reference_tts import ReferenceSpeechSynthesizer
from speech_transcriber import SpeechTranscriber

logging.basicConfig(
    level=os.getenv("CADENCE_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger("cadence.ai_engine.main")
reference_tts = ReferenceSpeechSynthesizer()
speech_transcriber = SpeechTranscriber()
scorer = PhonemeScorer(
    model_name=MODEL_NAME,
    reference_synthesizer=reference_tts,
)
scorer_warmup_lock = Lock()
tts_warmup_lock = Lock()
transcriber_warmup_lock = Lock()


def ensure_scorer_warmup_started(force: bool = False) -> None:
    if scorer.model_loaded and not force:
        return

    if scorer_warmup_lock.locked():
        return

    def target() -> None:
        with scorer_warmup_lock:
            scorer_start = time.perf_counter()
            try:
                scorer.warmup(force=force)
            finally:
                logger.info(
                    "Post-warmup scorer diagnostics: %s elapsed=%.2fs",
                    scorer.get_diagnostics(),
                    time.perf_counter() - scorer_start,
                )

    Thread(target=target, daemon=True).start()


def ensure_tts_warmup_started(force: bool = False) -> None:
    if reference_tts.model_loaded and not force:
        return

    if tts_warmup_lock.locked():
        return

    def target() -> None:
        with tts_warmup_lock:
            tts_start = time.perf_counter()
            try:
                reference_tts.warmup(force=force)
            except Exception:
                logger.exception("Reference TTS warmup failed during background startup")
            finally:
                logger.info(
                    "Post-warmup reference TTS diagnostics: %s elapsed=%.2fs",
                    reference_tts.get_status(),
                    time.perf_counter() - tts_start,
                )

    Thread(target=target, daemon=True).start()


def ensure_transcriber_warmup_started(force: bool = False) -> None:
    if speech_transcriber.model_loaded and not force:
        return

    if transcriber_warmup_lock.locked():
        return

    def target() -> None:
        with transcriber_warmup_lock:
            transcriber_start = time.perf_counter()
            try:
                speech_transcriber.warmup(force=force)
            except Exception:
                logger.exception("Speech transcriber warmup failed during background startup")
            finally:
                logger.info(
                    "Post-warmup ASR diagnostics: %s elapsed=%.2fs",
                    speech_transcriber.get_status(),
                    time.perf_counter() - transcriber_start,
                )

    Thread(target=target, daemon=True).start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Cadence AI engine starting")
    logger.info("Initial scorer diagnostics: %s", scorer.get_diagnostics())
    logger.info("Initial reference TTS diagnostics: %s", reference_tts.get_status())
    logger.info("Initial ASR diagnostics: %s", speech_transcriber.get_status())
    ensure_scorer_warmup_started()
    ensure_tts_warmup_started()
    ensure_transcriber_warmup_started()
    yield
    logger.info("Cadence AI engine shutting down")


app = FastAPI(
    title="Cadence AI Engine",
    version="0.1.0",
    description="FastAPI bridge for pronunciation assessment using Meta Wav2Vec2.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    if not scorer.model_loaded:
        ensure_scorer_warmup_started(force=True)

    if not reference_tts.model_loaded:
        ensure_tts_warmup_started(force=True)

    if not speech_transcriber.model_loaded:
        ensure_transcriber_warmup_started(force=True)

    payload = {
        "status": "ok" if scorer.model_loaded else "warming",
        "model": MODEL_NAME,
        "modelReady": scorer.model_loaded,
        "loadError": scorer.load_error,
        "hfTokenConfigured": bool(os.getenv("HF_TOKEN")),
        "diagnostics": scorer.get_diagnostics(),
        **reference_tts.get_status(),
        **speech_transcriber.get_status(),
    }
    logger.info(
        "Health response status=%s modelReady=%s loadError=%s ttsReady=%s ttsDevice=%s",
        payload["status"],
        payload["modelReady"],
        payload["loadError"],
        payload["ttsReady"],
        payload["ttsDevice"],
    )
    return payload


@app.post("/assess")
async def assess(audio: UploadFile = File(...), text: str = Form(...)) -> dict[str, object]:
    logger.info(
        "Assess request received filename=%s content_type=%s target=%s",
        audio.filename,
        audio.content_type,
        text,
    )
    audio_bytes = await audio.read()

    if not audio_bytes:
        logger.warning("Assess rejected because uploaded audio was empty")
        raise HTTPException(status_code=400, detail="Audio upload is empty.")

    if not text.strip():
        logger.warning("Assess rejected because target text was empty")
        raise HTTPException(status_code=400, detail="Target text is required.")

    try:
        result = scorer.assess(
            audio_bytes=audio_bytes,
            target_text=text,
            filename=audio.filename,
        )
    except RuntimeError as exc:
        logger.exception("Assess failed with runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Assess failed with value error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result["filename"] = audio.filename
    result["contentType"] = audio.content_type
    logger.info(
        "Assess response score=%s transcript=%s",
        result.get("overallScore"),
        result.get("transcript"),
    )
    return result


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, object]:
    logger.info(
        "Transcribe request received filename=%s content_type=%s",
        audio.filename,
        audio.content_type,
    )
    audio_bytes = await audio.read()

    if not audio_bytes:
        logger.warning("Transcribe rejected because uploaded audio was empty")
        raise HTTPException(status_code=400, detail="Audio upload is empty.")

    try:
        result = speech_transcriber.transcribe(
            audio_bytes=audio_bytes,
            filename=audio.filename,
        )
    except RuntimeError as exc:
        logger.exception("Transcribe failed with runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Transcribe failed with value error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result["filename"] = audio.filename
    result["contentType"] = audio.content_type
    logger.info("Transcribe response transcript=%s", result.get("transcript"))
    return result


@app.get("/reference-audio")
async def reference_audio(
    text: str,
    instruct: str | None = Query(default=None),
) -> Response:
    request_id = uuid4().hex[:8]
    stripped_text = text.strip()
    preview = " ".join(stripped_text.split())
    if len(preview) > 120:
        preview = f"{preview[:119]}…"

    logger.info(
        "Reference audio request received id=%s chars=%s instruct=%s preview=%s",
        request_id,
        len(stripped_text),
        instruct,
        preview,
    )

    if not stripped_text:
        logger.warning("Reference audio rejected because target text was empty")
        raise HTTPException(status_code=400, detail="Target text is required.")

    try:
        start_time = time.perf_counter()
        audio_bytes = reference_tts.synthesize(text=text, instruct=instruct)
        logger.info(
            "Reference audio request complete id=%s bytes=%s elapsed=%.2fs ttsDevice=%s",
            request_id,
            len(audio_bytes),
            time.perf_counter() - start_time,
            reference_tts.device_label,
        )
    except RuntimeError as exc:
        logger.exception("Reference audio failed with runtime error id=%s", request_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Reference audio failed with value error id=%s", request_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/reference-audio")
async def reference_audio_post(
    text: str = Form(...),
    instruct: str = Form(default=""),
) -> Response:
    return await reference_audio(text=text, instruct=instruct or None)


@app.get("/voice-options")
async def voice_options() -> dict[str, object]:
    from reference_tts import VALID_ENGLISH_INSTRUCTS

    grouped: dict[str, list[str]] = {
        "gender": [],
        "age": [],
        "pitch": [],
        "accent": [],
        "style": [],
    }
    gender_tokens = {"male", "female"}
    age_tokens = {"child", "teenager", "young adult", "middle-aged", "elderly"}
    pitch_tokens = {"very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch"}
    style_tokens = {"whisper"}

    for token in sorted(VALID_ENGLISH_INSTRUCTS):
        if token in gender_tokens:
            grouped["gender"].append(token)
        elif token in age_tokens:
            grouped["age"].append(token)
        elif token in pitch_tokens:
            grouped["pitch"].append(token)
        elif token in style_tokens:
            grouped["style"].append(token)
        elif "accent" in token:
            grouped["accent"].append(token)

    return {"options": grouped, "default": reference_tts.instruct}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("AI_ENGINE_HOST", "0.0.0.0"),
        port=int(os.getenv("AI_ENGINE_PORT", "8000")),
    )
