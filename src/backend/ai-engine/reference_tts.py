# FILE: src/ai-engine/reference_tts.py
from __future__ import annotations

import io
import json
import logging
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any

import numpy as np
import soundfile as sf

TTS_MODEL_NAME = os.getenv("OMNIVOICE_MODEL_NAME", "k2-fsa/OmniVoice")
TTS_LANGUAGE = os.getenv("OMNIVOICE_LANGUAGE", "English")
TTS_INSTRUCT = os.getenv(
    "OMNIVOICE_INSTRUCT",
    "elderly, moderate pitch, american accent",
)
TTS_DEVICE_PREFERENCE = os.getenv("OMNIVOICE_DEVICE", "auto")
TTS_WORD_NUM_STEP = int(os.getenv("OMNIVOICE_WORD_NUM_STEP", "32"))
TTS_WORD_SPEED = float(os.getenv("OMNIVOICE_WORD_SPEED", "0.86"))
TTS_WORD_MAX_WORDS = int(os.getenv("OMNIVOICE_WORD_MAX_WORDS", "2"))
TTS_NARRATION_NUM_STEP = int(os.getenv("OMNIVOICE_NARRATION_NUM_STEP", "16"))
TTS_NARRATION_SPEED = float(os.getenv("OMNIVOICE_NARRATION_SPEED", "0.9"))
TTS_NARRATION_THRESHOLD = int(os.getenv("OMNIVOICE_NARRATION_THRESHOLD", "120"))
TTS_PROVIDER = os.getenv("CADENCE_TTS_PROVIDER", "auto").strip().lower() or "auto"
TTS_REQUIRE_MODEL = (
    os.getenv("CADENCE_TTS_REQUIRE_MODEL", "1").strip().lower()
    not in {"0", "false", "no", "off"}
)

logger = logging.getLogger("cadence.ai_engine.reference_tts")

_DATA_DIR = pathlib.Path(__file__).parent.parent / "data"

def _load_json(filename: str) -> Any:
    path = _DATA_DIR / filename
    with path.open(encoding="utf-8") as f:
        return json.load(f)

_ipa_data = _load_json("ipa_narration.json")
IPA_NARRATION_MAP: dict[str, str] = _ipa_data["map"]

_voice_data = _load_json("voice_config.json")
VALID_ENGLISH_INSTRUCTS: set[str] = set(_voice_data["valid_instructs"])
VOICE_IDENTITY_TOKENS: set[str] = set(_voice_data["identity_tokens"])
VOICE_PITCH_TOKENS: set[str] = set(_voice_data["pitch_tokens"])
VOICE_ACCENT_TOKENS: set[str] = set(_voice_data["accent_tokens"])
INSTRUCT_NORMALIZATION_MAP: dict[str, str | None] = _voice_data["normalization_map"]

_macos_cfg = _voice_data["macos"]
MACOS_DEFAULT_TTS_MODEL_NAME: str = _macos_cfg["model_name"]
MACOS_SAY_RATE_WORD: int = _macos_cfg["say_rate_word"]
MACOS_SAY_RATE_NARRATION: int = _macos_cfg["say_rate_narration"]
MACOS_VOICE_PROFILES: dict[str, list[str]] = _macos_cfg["voice_profiles"]


def _preview_text(text: str, limit: int = 120) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 1]}…"


def normalize_narration_text(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        return normalized

    normalized = normalized.replace("—", ". ").replace("–", ". ")

    def replace_ipa(match: re.Match[str]) -> str:
        token = match.group(1).strip()
        if not token:
            return " "
        replacement = IPA_NARRATION_MAP.get(token)
        if replacement:
            return f" {replacement} "
        return f" {token} "

    normalized = re.sub(r"/([^/\n]{1,16})/", replace_ipa, normalized)
    normalized = re.sub(r"\s+\.\s+", ". ", normalized)
    normalized = re.sub(r"\s+,", ",", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def sanitize_instruct_text(instruct: str) -> str:
    items = [item.strip().lower() for item in instruct.split(",") if item.strip()]
    sanitized: list[str] = []

    for item in items:
        normalized = INSTRUCT_NORMALIZATION_MAP.get(item, item)
        if normalized and normalized in VALID_ENGLISH_INSTRUCTS:
            sanitized.append(normalized)

    deduped = list(dict.fromkeys(sanitized))
    if not deduped:
        deduped = ["elderly", "moderate pitch", "american accent"]

    return ", ".join(deduped)


def simplify_instruct_text(instruct: str) -> str:
    sanitized = sanitize_instruct_text(instruct)
    items = [item.strip() for item in sanitized.split(",") if item.strip()]
    if len(items) <= 3:
        return sanitized

    identity = next((item for item in items if item in VOICE_IDENTITY_TOKENS), None)
    pitch = next((item for item in items if item in VOICE_PITCH_TOKENS), None)
    accent = next((item for item in items if item in VOICE_ACCENT_TOKENS), None)

    simplified = [item for item in [identity, pitch, accent] if item]
    if not simplified:
        return sanitized

    return ", ".join(dict.fromkeys(simplified))


def classify_tts_mode(text: str) -> str:
    words = re.findall(r"[A-Za-z']+", text)
    if len(words) <= TTS_WORD_MAX_WORDS and len(text) <= TTS_NARRATION_THRESHOLD:
        return "word"
    return "narration"


def normalize_reference_word_text(text: str) -> str:
    normalized = normalize_narration_text(text)
    if not normalized:
        return normalized
    if normalized[-1] not in ".!?":
        normalized = f"{normalized}."
    return normalized


# Clips are keyed by request text and held in memory, so the cache is bounded.
REFERENCE_AUDIO_CACHE_MAX = 256


class ReferenceSpeechSynthesizer:
    def __init__(
        self,
        model_name: str = TTS_MODEL_NAME,
        language: str = TTS_LANGUAGE,
        instruct: str = TTS_INSTRUCT,
    ) -> None:
        self.model_name = model_name
        self.language = language
        self.instruct = sanitize_instruct_text(instruct)
        self.model_loaded = False
        self.load_error: str | None = None
        self.model: Any | None = None
        self.cache: dict[str, bytes] = {}
        self.device_label = "uninitialized"
        self.provider_label = "uninitialized"
        self.import_error: str | None = None
        self.last_warmup_seconds: float | None = None
        self.last_generation_seconds: float | None = None
        self._available_macos_voices: list[str] | None = None

    def _remember(self, key: str, audio_bytes: bytes) -> None:
        """Caches generated audio, dropping the oldest clip once the cache is full."""
        self.cache[key] = audio_bytes
        while len(self.cache) > REFERENCE_AUDIO_CACHE_MAX:
            self.cache.pop(next(iter(self.cache)))

    def _model_provider_required(self) -> bool:
        return TTS_REQUIRE_MODEL

    def _is_model_provider_active(self) -> bool:
        return (
            self.model_loaded
            and self.provider_label == "omnivoice"
            and self.model is not None
        )

    def _prepare_audio_output(
        self,
        audio: Any,
    ) -> tuple[np.ndarray, dict[str, float | bool]]:
        audio_array = np.asarray(audio, dtype=np.float32).squeeze()
        if audio_array.ndim > 1:
            audio_array = audio_array.mean(axis=0)

        audio_array = np.nan_to_num(audio_array, nan=0.0, posinf=0.0, neginf=0.0)
        if audio_array.size == 0:
            raise RuntimeError("Reference pronunciation generation returned empty audio.")

        audio_array = audio_array - float(np.mean(audio_array))
        raw_peak = float(np.max(np.abs(audio_array))) if audio_array.size else 0.0
        if raw_peak <= 1e-4:
            raise RuntimeError("Reference pronunciation generation returned silent audio.")

        if raw_peak > 1.0:
            audio_array = audio_array / raw_peak

        audio_array = np.clip(audio_array * 0.92, -0.98, 0.98)
        rms = float(np.sqrt(np.mean(np.square(audio_array))))
        zero_crossing_ratio = (
            float(np.mean(audio_array[:-1] * audio_array[1:] < 0))
            if audio_array.size > 1
            else 0.0
        )

        fade_length = min(256, audio_array.size // 20)
        if fade_length > 1:
            fade = np.linspace(0.0, 1.0, fade_length, dtype=np.float32)
            audio_array[:fade_length] *= fade
            audio_array[-fade_length:] *= fade[::-1]

        return audio_array.astype(np.float32, copy=False), {
            "rawPeak": raw_peak,
            "rms": rms,
            "zeroCrossingRatio": zero_crossing_ratio,
            "unstable": bool(rms > 0.16 and zero_crossing_ratio > 0.34),
        }

    def _build_instruct_candidates(self, instruct: str) -> list[str]:
        requested = sanitize_instruct_text(instruct)
        simplified = simplify_instruct_text(requested)
        candidates = [requested]
        if simplified != requested:
            candidates.append(simplified)
        if self.instruct not in candidates:
            candidates.append(self.instruct)
        return candidates

    def get_status(self) -> dict[str, Any]:
        is_model_active = self._is_model_provider_active()
        return {
            "ttsModel": (
                MACOS_DEFAULT_TTS_MODEL_NAME
                if self.provider_label == "macos-say"
                else self.model_name
            ),
            "ttsLanguage": self.language,
            "ttsInstruct": self.instruct,
            "ttsReady": is_model_active if self._model_provider_required() else self.model_loaded,
            "ttsLoadError": self.load_error,
            "ttsImportError": self.import_error,
            "ttsDevice": self.device_label,
            "ttsProvider": self.provider_label,
            "ttsFallbackActive": self.provider_label == "macos-say",
            "ttsRequiresModelProvider": self._model_provider_required(),
            "ttsCacheEntries": len(self.cache),
            "ttsLastWarmupSeconds": self.last_warmup_seconds,
            "ttsLastGenerationSeconds": self.last_generation_seconds,
        }

    def _resolve_load_kwargs(self, torch: Any) -> list[tuple[str, dict[str, Any]]]:
        preference = (TTS_DEVICE_PREFERENCE or "auto").lower()
        mps_available = bool(
            getattr(torch.backends, "mps", None)
            and torch.backends.mps.is_available()
        )

        if preference == "cuda":
            return [("cuda", {"device_map": "cuda:0", "dtype": torch.float16})]

        if preference == "mps":
            return [("mps", {"device_map": "mps", "dtype": torch.float16})]

        if preference == "cpu":
            return [("cpu", {"device_map": "cpu", "dtype": torch.float32})]

        options: list[tuple[str, dict[str, Any]]] = []
        if torch.cuda.is_available():
            options.append(("cuda", {"device_map": "cuda:0", "dtype": torch.float16}))

        if mps_available:
            options.append(("mps", {"device_map": "mps", "dtype": torch.float16}))

        options.append(("cpu", {"device_map": "cpu", "dtype": torch.float32}))
        return options

    def _macos_say_available(self) -> bool:
        return shutil.which("say") is not None and os.name == "posix" and sys.platform == "darwin"

    def _warmup_macos_say(self, force: bool = False) -> None:
        if self.model_loaded and self.provider_label == "macos-say" and not force:
            return

        if not self._macos_say_available():
            self.model_loaded = False
            self.model = None
            self.device_label = "unavailable"
            self.provider_label = "unavailable"
            self.load_error = "macOS Speech is unavailable on this machine."
            raise RuntimeError(self.load_error)

        self.model_loaded = True
        self.model = None
        self.load_error = None
        self.import_error = None
        self.device_label = "system"
        self.provider_label = "macos-say"
        self.last_warmup_seconds = 0.0
        logger.info("macOS Speech warmup complete")

    def _list_available_macos_voices(self) -> list[str]:
        if self._available_macos_voices is not None:
            return self._available_macos_voices

        try:
            result = subprocess.run(
                ["say", "-v", "?"],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            logger.exception("Could not enumerate macOS speech voices")
            self._available_macos_voices = []
            return self._available_macos_voices

        voices: list[str] = []
        for line in result.stdout.splitlines():
            match = re.match(r"^(.*?)\s{2,}[A-Za-z_]+(?:\s+#.*)?$", line.strip())
            if not match:
                continue

            voice_name = match.group(1).strip()
            if voice_name:
                voices.append(voice_name)

        self._available_macos_voices = voices
        return voices

    def _select_macos_voice(self, instruct: str) -> str:
        available = set(self._list_available_macos_voices())
        tokens = {
            token.strip()
            for token in sanitize_instruct_text(instruct).split(",")
            if token.strip()
        }

        accent = "american-default"
        if "british accent" in tokens:
            accent = "british-default"
        elif "australian accent" in tokens:
            accent = "australian-default"
        elif "indian accent" in tokens:
            accent = "indian-default"

        profile_candidates: list[str] = []
        if "male" in tokens:
            profile_candidates.append(accent.replace("-default", "-male"))
        elif "female" in tokens:
            profile_candidates.append(accent.replace("-default", "-female"))

        profile_candidates.append(accent)
        profile_candidates.append("fallback")

        for profile_name in profile_candidates:
            for voice in MACOS_VOICE_PROFILES.get(profile_name, []):
                if voice in available:
                    return voice

        if available:
            for preferred in ("Eddy (English (US))", "Flo (English (US))", "Samantha"):
                if preferred in available:
                    return preferred
            return sorted(available)[0]

        raise RuntimeError("macOS Speech could not find an available system voice.")

    def _synthesize_with_macos_say(
        self,
        text: str,
        mode: str,
        instruct: str,
    ) -> bytes:
        voice = self._select_macos_voice(instruct)
        rate = MACOS_SAY_RATE_WORD if mode == "word" else MACOS_SAY_RATE_NARRATION

        with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as temp_file:
            output_path = temp_file.name

        try:
            result = subprocess.run(
                ["say", "-v", voice, "-r", str(rate), "-o", output_path, text],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                raise RuntimeError(
                    result.stderr.strip()
                    or result.stdout.strip()
                    or "macOS Speech could not generate reference audio."
                )

            audio_array, sample_rate = sf.read(output_path, dtype="float32")
            audio_array, diagnostics = self._prepare_audio_output(audio_array)

            buffer = io.BytesIO()
            sf.write(
                buffer,
                audio_array,
                int(sample_rate) if sample_rate else 22050,
                format="WAV",
                subtype="PCM_16",
            )
            audio_bytes = buffer.getvalue()
            logger.info(
                "macOS Speech generated reference audio voice=%s rate=%s bytes=%s diagnostics=%s",
                voice,
                rate,
                len(audio_bytes),
                diagnostics,
            )
            return audio_bytes
        finally:
            try:
                os.unlink(output_path)
            except FileNotFoundError:
                pass

    def warmup(self, force: bool = False) -> None:
        if self.model_loaded and (
            self.model is not None or self.provider_label == "macos-say"
        ) and not force:
            return

        if TTS_PROVIDER in {"say", "macos", "macos-say"}:
            if self._model_provider_required():
                self.model_loaded = False
                self.model = None
                self.device_label = "unavailable"
                self.provider_label = "misconfigured"
                self.load_error = (
                    "Cadence is configured to require the OmniVoice model, but the desktop runtime forced macOS Speech instead."
                )
                logger.error(self.load_error)
                raise RuntimeError(self.load_error)
            self._warmup_macos_say(force=force)
            return

        logger.info(
            "OmniVoice warmup started model=%s language=%s preference=%s instruct=%s",
            self.model_name,
            self.language,
            TTS_DEVICE_PREFERENCE,
            self.instruct,
        )

        start_time = time.perf_counter()

        try:
            import torch
            from omnivoice import OmniVoice
        except Exception as exc:
            if (
                TTS_PROVIDER == "auto"
                and self._macos_say_available()
                and not self._model_provider_required()
            ):
                self.import_error = str(exc)
                logger.warning(
                    "OmniVoice imports unavailable; falling back to macOS Speech: %s",
                    exc,
                )
                self._warmup_macos_say(force=force)
                return
            self.import_error = str(exc)
            self.load_error = (
                f"OmniVoice could not be imported and system voice fallback is disabled: {exc}"
                if self._model_provider_required()
                else str(exc)
            )
            logger.exception("OmniVoice warmup failed during imports")
            raise RuntimeError(self.load_error) from exc

        self.import_error = None
        load_attempts = self._resolve_load_kwargs(torch)
        last_error: Exception | None = None

        for device_label, load_kwargs in load_attempts:
            try:
                logger.info(
                    "OmniVoice loading on device=%s kwargs=%s",
                    device_label,
                    {key: str(value) for key, value in load_kwargs.items()},
                )
                self.model = OmniVoice.from_pretrained(self.model_name, **load_kwargs)
                self.model_loaded = True
                self.load_error = None
                self.device_label = device_label
                self.provider_label = "omnivoice"
                self.last_warmup_seconds = round(time.perf_counter() - start_time, 2)
                logger.info(
                    "OmniVoice warmup complete device=%s elapsed=%.2fs",
                    self.device_label,
                    self.last_warmup_seconds,
                )
                return
            except Exception as exc:
                last_error = exc
                logger.exception(
                    "OmniVoice load attempt failed device=%s; trying next option",
                    device_label,
                )

        self.model_loaded = False
        self.model = None
        self.device_label = "unavailable"
        self.provider_label = "omnivoice"
        self.load_error = (
            f"OmniVoice failed to load and system voice fallback is disabled: {last_error}"
            if self._model_provider_required() and last_error
            else str(last_error) if last_error else "OmniVoice failed to load."
        )
        raise RuntimeError(self.load_error)

    def synthesize(self, text: str, instruct: str | None = None) -> bytes:
        original_text = text.strip()
        if not original_text:
            raise ValueError("Target text is required for reference audio.")

        effective_instruct = (
            sanitize_instruct_text(instruct)
            if instruct and instruct.strip()
            else self.instruct
        )

        mode = classify_tts_mode(original_text)
        if mode == "word":
            normalized_text = normalize_reference_word_text(original_text)
            generation_kwargs: dict[str, Any] = {
                "text": normalized_text,
                "num_step": TTS_WORD_NUM_STEP,
                "speed": TTS_WORD_SPEED,
            }
        else:
            normalized_text = normalize_narration_text(original_text)
            generation_kwargs = {
                "text": normalized_text,
                "num_step": TTS_NARRATION_NUM_STEP,
                "speed": TTS_NARRATION_SPEED,
            }

        warmup_start = time.perf_counter()
        self.warmup()
        warmup_elapsed = time.perf_counter() - warmup_start

        if self._model_provider_required() and not self._is_model_provider_active():
            raise RuntimeError(
                self.load_error
                or "Cadence requires the OmniVoice model for desktop reference audio, but it is not active."
            )

        cache_key = (
            f"{self.provider_label}:{mode}:{self.language}:{effective_instruct}:{generation_kwargs}:{normalized_text.lower()}"
        )
        if cache_key in self.cache:
            logger.info(
                "Reference audio cache hit mode=%s original_chars=%s normalized_chars=%s cached_bytes=%s preview=%s",
                mode,
                len(original_text),
                len(normalized_text),
                len(self.cache[cache_key]),
                _preview_text(normalized_text),
            )
            return self.cache[cache_key]

        if self.provider_label == "macos-say":
            generation_start = time.perf_counter()
            audio_bytes = self._synthesize_with_macos_say(
                normalized_text,
                mode,
                effective_instruct,
            )
            self._remember(cache_key, audio_bytes)
            self.last_generation_seconds = round(
                time.perf_counter() - generation_start,
                2,
            )
            return audio_bytes

        if self.model is None:
            raise RuntimeError(self.load_error or "OmniVoice is not ready.")

        instruct_candidates = self._build_instruct_candidates(effective_instruct)
        last_error: Exception | None = None

        for index, instruct_candidate in enumerate(instruct_candidates):
            candidate_kwargs = {
                **generation_kwargs,
                "instruct": instruct_candidate,
            }

            try:
                generation_start = time.perf_counter()
                logger.info(
                    "Reference audio generation started mode=%s device=%s original_chars=%s normalized_chars=%s params=%s preview=%s",
                    mode,
                    self.device_label,
                    len(original_text),
                    len(normalized_text),
                    candidate_kwargs,
                    _preview_text(normalized_text),
                )
                audio = self.model.generate(**candidate_kwargs)

                first_audio = audio[0]
                if hasattr(first_audio, "detach"):
                    audio_tensor = first_audio.detach().cpu().float().squeeze(0)
                    raw_audio = audio_tensor.numpy()
                else:
                    raw_audio = first_audio

                audio_array, diagnostics = self._prepare_audio_output(raw_audio)
                if diagnostics["unstable"] and index < len(instruct_candidates) - 1:
                    logger.warning(
                        "Reference audio looked unstable for instruct=%s diagnostics=%s; retrying with fallback voice conditioning",
                        instruct_candidate,
                        diagnostics,
                    )
                    continue

                sample_rate = 24000
                buffer = io.BytesIO()
                sf.write(buffer, audio_array, sample_rate, format="WAV", subtype="PCM_16")
                audio_bytes = buffer.getvalue()
                self._remember(cache_key, audio_bytes)
                self.last_generation_seconds = round(
                    time.perf_counter() - generation_start,
                    2,
                )
                audio_duration_seconds = 0.0
                try:
                    audio_duration_seconds = round(len(audio_array) / sample_rate, 2)
                except Exception:
                    audio_duration_seconds = 0.0
                logger.info(
                    "Reference audio generated mode=%s device=%s instruct=%s original_chars=%s normalized_chars=%s sample_rate=%s duration=%.2fs bytes=%s warmup_wait=%.2fs generation=%.2fs diagnostics=%s",
                    mode,
                    self.device_label,
                    instruct_candidate,
                    len(original_text),
                    len(normalized_text),
                    sample_rate,
                    audio_duration_seconds,
                    len(audio_bytes),
                    warmup_elapsed,
                    self.last_generation_seconds,
                    diagnostics,
                )
                return audio_bytes
            except Exception as exc:
                last_error = exc
                if index < len(instruct_candidates) - 1:
                    logger.warning(
                        "Reference audio generation failed for instruct=%s; retrying with fallback voice conditioning",
                        instruct_candidate,
                        exc_info=exc,
                    )
                    continue

                logger.exception("OmniVoice generation failed")

        raise RuntimeError(
            f"Reference pronunciation generation failed: {last_error}"
        ) from last_error
