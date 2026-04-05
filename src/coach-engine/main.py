# FILE: src/coach-engine/main.py
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from threading import Lock, Thread

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from coach_llm import GemmaCoachEngine

logging.basicConfig(
    level=os.getenv("CADENCE_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger("cadence.coach_engine.main")
coach_llm = GemmaCoachEngine()
coach_warmup_lock = Lock()


def ensure_coach_warmup_started(force: bool = False) -> None:
    if coach_llm.model_loaded and not force:
        return

    if coach_warmup_lock.locked():
        return

    def target() -> None:
        with coach_warmup_lock:
            coach_start = time.perf_counter()
            try:
                coach_llm.warmup(force=force)
            except Exception:
                logger.exception("Coach LLM warmup failed during background startup")
            finally:
                logger.info(
                    "Post-warmup coach diagnostics: %s elapsed=%.2fs",
                    coach_llm.get_status(),
                    time.perf_counter() - coach_start,
                )

    Thread(target=target, daemon=True).start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Cadence coach engine starting")
    logger.info("Initial coach diagnostics: %s", coach_llm.get_status())
    ensure_coach_warmup_started()
    yield
    logger.info("Cadence coach engine shutting down")


app = FastAPI(
    title="Cadence Coach Engine",
    version="0.1.0",
    description="FastAPI service for local AI coach turns.",
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
    if not coach_llm.model_loaded:
        ensure_coach_warmup_started(force=True)

    status = coach_llm.get_status()
    return {
        "ready": status["coachReady"],
        "provider": "local-coach",
        "model": status["coachModel"],
        "message": "AI Coach is ready through the local coach model."
        if status["coachReady"]
        else f"AI Coach is warming up: {status['coachLoadError'] or ('loading ' + str(status['coachModel']))}",
        **status,
    }


@app.get("/coach-status")
async def coach_status() -> dict[str, object]:
    return await health()


@app.post("/coach-turn")
async def coach_turn(payload: dict[str, object]) -> dict[str, object]:
    logger.info(
        "Coach turn request received action=%s topic=%s history=%s",
        payload.get("action"),
        payload.get("topic"),
        len(payload.get("history") or []) if isinstance(payload.get("history"), list) else 0,
    )

    try:
        result = coach_llm.generate_turn(payload)
    except RuntimeError as exc:
        logger.exception("Coach turn failed with runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Coach turn failed with value error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info(
        "Coach turn response provider=%s model=%s checkpoint=%s",
        result.get("provider"),
        result.get("model"),
        result.get("turn", {}).get("checkpoint") if isinstance(result.get("turn"), dict) else None,
    )
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("COACH_ENGINE_HOST", "0.0.0.0"),
        port=int(os.getenv("COACH_ENGINE_PORT", "8001")),
    )
