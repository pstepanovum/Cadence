from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from phoneme_scorer import _load_audio

logger = logging.getLogger("cadence.ai_engine.transcriber")

DEFAULT_ASR_MODEL = os.getenv("CADENCE_ASR_MODEL", "openai/whisper-base.en")


class SpeechTranscriber:
    def __init__(self, model_name: str = DEFAULT_ASR_MODEL) -> None:
        self.model_name = model_name
        self.model_loaded = False
        self.load_error: str | None = None
        self.device: Any | None = None
        self.processor: Any | None = None
        self.model: Any | None = None
        self.last_warmup_seconds: float | None = None
        self.last_generation_seconds: float | None = None
        self._warmup_lock = threading.Lock()
        self._warmup_attempts = 0

    def warmup(self, force: bool = False) -> None:
        """Loads Whisper once; a caller arriving mid-load waits for that load."""
        if self.model_loaded and not force:
            return
        attempt = self._warmup_attempts
        with self._warmup_lock:
            if self.model_loaded and (not force or self._warmup_attempts != attempt):
                return
            try:
                self._load()
            finally:
                self._warmup_attempts += 1

    def _load(self) -> None:
        load_start = time.perf_counter()
        logger.info("ASR warmup started model=%s", self.model_name)

        try:
            import torch
            from transformers import WhisperForConditionalGeneration, WhisperProcessor
        except Exception as exc:  # pragma: no cover - depends on local env
            self.load_error = str(exc)
            self.model_loaded = False
            logger.exception("ASR warmup failed during imports")
            return

        try:
            self.processor = WhisperProcessor.from_pretrained(self.model_name)
            self.model = WhisperForConditionalGeneration.from_pretrained(self.model_name)
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
            elif torch.backends.mps.is_available():
                self.device = torch.device("mps")
            else:
                self.device = torch.device("cpu")
            self.model.to(self.device)
            self.model.eval()
        except Exception as exc:  # pragma: no cover - depends on local env
            self.load_error = str(exc)
            self.model_loaded = False
            self.processor = None
            self.model = None
            self.device = None
            logger.exception("ASR warmup failed while loading model assets")
            return

        self.model_loaded = True
        self.load_error = None
        self.last_warmup_seconds = time.perf_counter() - load_start
        logger.info(
            "ASR warmup complete model=%s device=%s elapsed=%.2fs",
            self.model_name,
            self.device,
            self.last_warmup_seconds,
        )

    def get_status(self) -> dict[str, Any]:
        return {
            "transcriberModel": self.model_name,
            "transcriberReady": self.model_loaded,
            "transcriberLoadError": self.load_error,
            "transcriberDevice": str(self.device) if self.device is not None else None,
            "transcriberLastWarmupSeconds": self.last_warmup_seconds,
            "transcriberLastGenerationSeconds": self.last_generation_seconds,
        }

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str | None = None,
    ) -> dict[str, Any]:
        self.warmup()

        if not self.model_loaded or self.model is None or self.processor is None:
            raise RuntimeError(self.load_error or "The ASR model is not ready.")

        import torch

        try:
            waveform = _load_audio(audio_bytes, filename=filename)
            input_features = self.processor(
                waveform,
                sampling_rate=16000,
                return_tensors="pt",
            ).input_features
            input_features = input_features.to(self.device)

            generation_start = time.perf_counter()
            with torch.no_grad():
                predicted_ids = self.model.generate(input_features)

            transcription = self.processor.batch_decode(
                predicted_ids,
                skip_special_tokens=True,
            )[0].strip()
            self.last_generation_seconds = time.perf_counter() - generation_start
        except ValueError:
            # Bad audio (undecodable or too long) is the caller's 400 or 413,
            # not an engine failure.
            raise
        except Exception as exc:  # pragma: no cover - depends on local env
            logger.exception("ASR transcription failed")
            raise RuntimeError(f"ASR transcription failed: {exc}") from exc

        logger.info(
            "ASR transcription complete model=%s device=%s elapsed=%.2fs transcript=%s",
            self.model_name,
            self.device,
            self.last_generation_seconds or 0.0,
            transcription,
        )

        return {
            "transcript": transcription,
            "engine": self.model_name,
            "modelReady": self.model_loaded,
            "loadError": self.load_error,
        }
