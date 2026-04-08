# FILE: src/ai-engine/phoneme_scorer.py
from __future__ import annotations

import importlib.metadata
import importlib.util
import io
import json
import logging
import os
import re
import shutil
import sys
from typing import Any

import pathlib

import numpy as np
import soundfile as sf


MODEL_NAME = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
# The default branch of this model still exposes pickle weights. Pin the
# known safetensors snapshot so desktop installs can stay on the Intel-safe
# torch build while satisfying the newer transformers security checks.
MODEL_REVISION = "3e836924cfd3b858a0bbdbc1f7ef412105d00446"
MODEL_WEIGHTS_FILENAME = "model.safetensors"
logger = logging.getLogger("cadence.ai_engine.scorer")

_TARGETS_PATH = pathlib.Path(__file__).parent / "practice_targets.json"
with _TARGETS_PATH.open(encoding="utf-8") as _f:
    PRACTICE_TARGETS: dict[str, dict[str, Any]] = json.load(_f)

logger.info("Loaded %d practice targets from %s", len(PRACTICE_TARGETS), _TARGETS_PATH)

TARGET_SAMPLE_RATE = 16000


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _normalize_phoneme_string(raw_value: str) -> str:
    return " ".join(part for part in raw_value.replace("|", " ").split() if part)


def _decode_ctc_predictions(
    token_ids: list[int],
    id_to_token: dict[int, str],
    blank_id: int | None,
) -> str:
    pieces: list[str] = []
    previous_id: int | None = None

    for token_id in token_ids:
        if token_id == previous_id:
            continue

        previous_id = token_id

        if blank_id is not None and token_id == blank_id:
            continue

        token = id_to_token.get(token_id, "")

        if not token or token.startswith("<"):
            continue

        if token == "|":
            pieces.append(" ")
        else:
            pieces.append(token)

    return _normalize_phoneme_string(" ".join(pieces))


def _load_audio(audio_bytes: bytes, filename: str | None = None) -> np.ndarray:
    del filename

    try:
        waveform, sample_rate = sf.read(
            io.BytesIO(audio_bytes),
            dtype="float32",
            always_2d=True,
        )
    except Exception as exc:
        raise ValueError("The uploaded file did not contain decodable WAV audio.") from exc

    if waveform.size == 0:
        raise ValueError("The uploaded file did not contain decodable audio.")

    mono_waveform = waveform.mean(axis=1, dtype=np.float32)
    if mono_waveform.size == 0:
        raise ValueError("The uploaded file did not contain decodable audio.")

    if sample_rate != TARGET_SAMPLE_RATE:
        duration_seconds = mono_waveform.size / max(sample_rate, 1)
        target_length = max(1, int(round(duration_seconds * TARGET_SAMPLE_RATE)))
        source_positions = np.linspace(
            0,
            mono_waveform.size - 1,
            num=mono_waveform.size,
            dtype=np.float32,
        )
        target_positions = np.linspace(
            0,
            mono_waveform.size - 1,
            num=target_length,
            dtype=np.float32,
        )
        mono_waveform = np.interp(target_positions, source_positions, mono_waveform)

    return mono_waveform.astype(np.float32, copy=False)


def _tokenize_visible_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text)


def _build_segments_from_words(target_text: str, token_count: int) -> list[dict[str, Any]]:
    words = _tokenize_visible_words(target_text)
    if not words:
        cleaned = target_text.strip() or "reply"
        return [{"text": cleaned, "start": 0, "end": max(token_count, 1)}]

    if token_count <= 0:
        return [{"text": word, "start": 0, "end": 0} for word in words]

    if token_count < len(words):
        segments: list[dict[str, Any]] = []
        cursor = 0
        for index, word in enumerate(words):
            next_cursor = cursor + (1 if index < token_count else 0)
            segments.append(
                {
                    "text": word,
                    "start": cursor,
                    "end": next_cursor,
                }
            )
            cursor = next_cursor
        return segments

    weights = [max(len(word), 1) for word in words]
    total_weight = sum(weights)
    remaining_tokens = token_count - len(words)

    fractional_allocations = [
        (remaining_tokens * weight / total_weight) if total_weight else 0
        for weight in weights
    ]
    extra_allocations = [int(value) for value in fractional_allocations]
    leftovers = remaining_tokens - sum(extra_allocations)

    if leftovers > 0:
        ranked_indexes = sorted(
            range(len(words)),
            key=lambda index: fractional_allocations[index] - extra_allocations[index],
            reverse=True,
        )
        for index in ranked_indexes[:leftovers]:
            extra_allocations[index] += 1

    segments = []
    cursor = 0
    for word, extra in zip(words, extra_allocations, strict=False):
        allocation = 1 + extra
        segments.append(
            {
                "text": word,
                "start": cursor,
                "end": cursor + allocation,
            }
        )
        cursor += allocation

    return segments


def _phonemize_target_phrase(target_text: str) -> dict[str, Any]:
    try:
        from phonemizer import phonemize
        from phonemizer.separator import Separator
    except Exception as exc:
        raise ValueError(
            "Dynamic target phonemization is unavailable because phonemizer could not be imported."
        ) from exc

    separator = Separator(phone=" ", word=" | ")
    normalized_phrase = target_text.strip()
    if not normalized_phrase:
        raise ValueError("Target text is empty.")

    words = _tokenize_visible_words(normalized_phrase)
    if not words:
        raise ValueError(f"No pronounceable words were found in '{target_text}'.")

    phrase_ipa = phonemize(
        normalized_phrase,
        language="en-us",
        backend="espeak",
        separator=separator,
        strip=True,
        preserve_punctuation=False,
        with_stress=False,
        njobs=1,
        language_switch="remove-flags",
    )
    normalized_phrase_ipa = _normalize_phoneme_string(phrase_ipa.replace("|", " "))
    if not normalized_phrase_ipa:
        raise ValueError(f"Could not derive an IPA target for '{target_text}'.")

    segments: list[dict[str, Any]] = []
    cursor = 0
    for word in words:
        word_ipa = phonemize(
            word,
            language="en-us",
            backend="espeak",
            separator=Separator(phone=" ", word=""),
            strip=True,
            preserve_punctuation=False,
            with_stress=False,
            njobs=1,
            language_switch="remove-flags",
        )
        normalized_word_ipa = _normalize_phoneme_string(word_ipa)
        if not normalized_word_ipa:
            continue

        token_count = len(normalized_word_ipa.split())
        segments.append(
            {
                "text": word,
                "start": cursor,
                "end": cursor + token_count,
            }
        )
        cursor += token_count

    return {
        "ipa": normalized_phrase_ipa,
        "segments": segments,
    }


def _build_alignment(
    target_tokens: list[str],
    heard_tokens: list[str],
) -> list[dict[str, Any]]:
    rows = len(target_tokens)
    cols = len(heard_tokens)
    dp = [[0] * (cols + 1) for _ in range(rows + 1)]

    for i in range(rows + 1):
        dp[i][0] = i
    for j in range(cols + 1):
        dp[0][j] = j

    for i in range(1, rows + 1):
        for j in range(1, cols + 1):
            substitution_cost = 0 if target_tokens[i - 1] == heard_tokens[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + substitution_cost,
            )

    aligned_pairs: list[tuple[str, str]] = []
    i = rows
    j = cols
    while i > 0 or j > 0:
        if (
            i > 0
            and j > 0
            and dp[i][j]
            == dp[i - 1][j - 1]
            + (0 if target_tokens[i - 1] == heard_tokens[j - 1] else 1)
        ):
            aligned_pairs.append((target_tokens[i - 1], heard_tokens[j - 1]))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            aligned_pairs.append((target_tokens[i - 1], "-"))
            i -= 1
        else:
            j -= 1

    aligned_pairs.reverse()
    alignment: list[dict[str, Any]] = []
    for expected, heard in aligned_pairs:
        is_match = heard == expected
        alignment.append(
            {
                "symbol": f"/{expected}/",
                "expected": f"/{expected}/",
                "heard": f"/{heard}/",
                "accuracy": 96 if is_match else 48,
                "status": "correct" if is_match else "needs-work",
            }
        )

    return alignment


def _edit_distance(target_tokens: list[str], heard_tokens: list[str]) -> int:
    rows = len(target_tokens)
    cols = len(heard_tokens)
    dp = [[0] * (cols + 1) for _ in range(rows + 1)]

    for i in range(rows + 1):
        dp[i][0] = i
    for j in range(cols + 1):
        dp[0][j] = j

    for i in range(1, rows + 1):
        for j in range(1, cols + 1):
            substitution_cost = 0 if target_tokens[i - 1] == heard_tokens[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + substitution_cost,
            )

    return dp[rows][cols]


def _build_live_assessment(target_text: str, transcription: str) -> dict[str, Any]:
    normalized_target = target_text.strip().lower()
    practice_target = PRACTICE_TARGETS.get(normalized_target)

    if not practice_target:
        practice_target = {
            "ipa": "",
            "segments": _build_segments_from_words(target_text, 0),
        }

    return _build_live_assessment_from_target(
        target_text,
        practice_target,
        transcription,
    )


def _build_live_assessment_from_target(
    target_text: str,
    practice_target: dict[str, Any],
    transcription: str,
) -> dict[str, Any]:
    heard_tokens = transcription.split()

    target_tokens = practice_target["ipa"].split()
    phonemes = _build_alignment(target_tokens, heard_tokens)
    distance = _edit_distance(target_tokens, heard_tokens)
    baseline = max(len(target_tokens), len(heard_tokens), 1)
    overall_score = _clamp(round((1 - (distance / baseline)) * 100), 0, 100)
    target_is_phrase = len(_tokenize_visible_words(target_text)) > 1

    highlights = []
    for segment in practice_target["segments"]:
        segment_phonemes = phonemes[segment["start"] : segment["end"]]
        if not segment_phonemes:
            status = "needs-work"
        else:
            average_accuracy = round(
                sum(item["accuracy"] for item in segment_phonemes) / len(segment_phonemes)
            )
            if average_accuracy >= 90:
                status = "correct"
            elif average_accuracy >= 65:
                status = "mixed"
            else:
                status = "needs-work"

        expected_segment = (
            f"/{' '.join(item['expected'].strip('/') for item in segment_phonemes)}/"
            if segment_phonemes
            else "/—/"
        )
        heard_segment = (
            f"/{' '.join(item['heard'].strip('/') for item in segment_phonemes)}/"
            if segment_phonemes
            else "/—/"
        )

        highlights.append(
            {
                "text": segment["text"],
                "status": status,
                "feedback": (
                    f"Expected {expected_segment}, heard {heard_segment}. This segment aligned well with the target phonemes."
                    if status == "correct"
                    else (
                        f"Expected {expected_segment}, heard {heard_segment}. This segment is close, but it still needs another pass."
                        if status == "mixed"
                        else f"Expected {expected_segment}, heard {heard_segment}. This segment is where the current take drifts from the target."
                    )
                ),
            }
        )

    weakest = min(phonemes, key=lambda phoneme: phoneme["accuracy"])

    return {
        "targetText": target_text.strip() or target_text,
        "ipaTarget": f"/{practice_target['ipa']}/",
        "transcript": transcription,
        "overallScore": overall_score,
        "summary": (
            "The decoded phonemes matched the target cleanly."
            if overall_score >= 90
            else (
                f"The live decode is running, and {weakest['expected']} is the clearest mismatch in this reply."
                if target_is_phrase
                else f"The live decode is running, and {weakest['expected']} is the clearest mismatch in this take."
            )
        ),
        "nextStep": (
            "Repeat the same reply once more to lock the sound in."
            if target_is_phrase and overall_score >= 90
            else "Repeat the same shape once more to lock the sound in."
            if overall_score >= 90
            else (
                f"Slow down and focus on {weakest['expected']} before repeating the full reply."
                if target_is_phrase
                else f"Slow down and focus on {weakest['expected']} before repeating the full word."
            )
        ),
        "engine": MODEL_NAME,
        "highlights": highlights,
        "phonemes": phonemes,
    }


class PhonemeScorer:
    def __init__(
        self,
        model_name: str = MODEL_NAME,
        reference_synthesizer: Any | None = None,
    ) -> None:
        self.model_name = model_name
        self.model_revision = MODEL_REVISION
        self.reference_synthesizer = reference_synthesizer
        self.model_loaded = False
        self.load_error: str | None = None
        self.device: Any | None = None
        self.model: Any | None = None
        self.feature_extractor: Any | None = None
        self.id_to_token: dict[int, str] = {}
        self.blank_id: int | None = None
        self.dynamic_target_cache: dict[str, dict[str, Any]] = {}

    def get_diagnostics(self) -> dict[str, Any]:
        phonemizer_spec = importlib.util.find_spec("phonemizer")

        try:
            phonemizer_version = (
                importlib.metadata.version("phonemizer")
                if phonemizer_spec
                else None
            )
        except importlib.metadata.PackageNotFoundError:
            phonemizer_version = None

        return {
            "pythonExecutable": sys.executable,
            "pythonVersion": sys.version,
            "workingDirectory": os.getcwd(),
            "phonemizerImportable": phonemizer_spec is not None,
            "phonemizerVersion": phonemizer_version,
            "espeakPath": shutil.which("espeak"),
            "espeakNgPath": shutil.which("espeak-ng"),
            "hfTokenConfigured": bool(os.getenv("HF_TOKEN")),
            "modelLoaded": self.model_loaded,
            "loadError": self.load_error,
            "modelName": self.model_name,
            "modelRevision": self.model_revision,
            "modelWeights": MODEL_WEIGHTS_FILENAME,
            "device": str(self.device) if self.device is not None else None,
        }

    def warmup(self, force: bool = False) -> None:
        """Prepare the transformer objects lazily when you're ready for real inference."""
        if self.model_loaded and not force:
            return

        logger.info("Warmup started for model %s", self.model_name)
        logger.info("Dependency diagnostics: %s", self.get_diagnostics())

        try:
            import torch
            from huggingface_hub import hf_hub_download
            from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        except Exception as exc:  # pragma: no cover - depends on local env
            self.load_error = str(exc)
            logger.exception("Warmup failed during imports")
            return

        try:
            vocab_path = hf_hub_download(
                repo_id=self.model_name,
                filename="vocab.json",
                revision=self.model_revision,
            )
            hf_hub_download(
                repo_id=self.model_name,
                filename=MODEL_WEIGHTS_FILENAME,
                revision=self.model_revision,
            )
            with open(vocab_path, "r", encoding="utf-8") as vocab_file:
                vocab = json.load(vocab_file)

            self.id_to_token = {token_id: token for token, token_id in vocab.items()}
            self.feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(
                self.model_name,
                revision=self.model_revision,
            )
            self.model = Wav2Vec2ForCTC.from_pretrained(
                self.model_name,
                revision=self.model_revision,
                use_safetensors=True,
            )
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.model.to(self.device)
            self.model.eval()
            self.blank_id = (
                self.model.config.pad_token_id
                if getattr(self.model.config, "pad_token_id", None) is not None
                else vocab.get("<pad>")
            )
        except Exception as exc:  # pragma: no cover - depends on local env
            self.load_error = str(exc)
            self.model_loaded = False
            self.feature_extractor = None
            self.model = None
            self.device = None
            self.id_to_token = {}
            self.blank_id = None
            logger.exception("Warmup failed while loading model assets")
            return

        self.model_loaded = True
        self.load_error = None
        logger.info(
            "Warmup complete. device=%s blank_id=%s vocab_size=%s revision=%s",
            self.device,
            self.blank_id,
            len(self.id_to_token),
            self.model_revision,
        )

    def _decode_waveform(self, waveform: np.ndarray) -> str:
        import torch

        inputs = self.feature_extractor(
            waveform,
            sampling_rate=16000,
            return_tensors="pt",
            padding="longest",
        )

        input_values = inputs.input_values.to(self.device)
        attention_mask = (
            inputs.attention_mask.to(self.device)
            if hasattr(inputs, "attention_mask") and inputs.attention_mask is not None
            else None
        )

        with torch.no_grad():
            logits = self.model(input_values, attention_mask=attention_mask).logits

        predicted_ids = torch.argmax(logits, dim=-1)
        return _decode_ctc_predictions(
            predicted_ids[0].tolist(),
            self.id_to_token,
            self.blank_id,
        )

    def _derive_target_from_reference_audio(self, target_text: str) -> dict[str, Any]:
        if self.reference_synthesizer is None:
            raise ValueError(
                "No IPA target mapping is configured and no reference synthesizer is available for fallback."
            )

        logger.info(
            "Falling back to reference-audio target derivation for %s",
            target_text,
        )
        reference_audio = self.reference_synthesizer.synthesize(text=target_text)
        reference_waveform = _load_audio(reference_audio, filename="reference.wav")
        reference_transcription = self._decode_waveform(reference_waveform)

        if not reference_transcription:
            raise ValueError(
                f"Could not derive a phoneme target from reference audio for '{target_text}'."
            )

        return {
            "ipa": reference_transcription,
            "segments": _build_segments_from_words(
                target_text,
                len(reference_transcription.split()),
            ),
        }

    def _resolve_target_definition(self, target_text: str) -> dict[str, Any]:
        normalized_target = target_text.strip().lower()
        if normalized_target in PRACTICE_TARGETS:
            return PRACTICE_TARGETS[normalized_target]

        cached_target = self.dynamic_target_cache.get(normalized_target)
        if cached_target:
            return cached_target

        # --- Try phonemizer (fast, no audio needed) ---
        try:
            resolved_target = _phonemize_target_phrase(target_text)
            logger.info(
                "Dynamic target derived with phonemizer target=%s ipa=%s",
                target_text,
                resolved_target["ipa"],
            )
            self.dynamic_target_cache[normalized_target] = resolved_target
            return resolved_target
        except Exception as exc:
            logger.warning(
                "Dynamic phonemization unavailable for target=%s reason=%s",
                target_text,
                exc,
            )

        # --- Try reference-audio derivation (TTS → wav2vec2 decode) ---
        try:
            resolved_target = self._derive_target_from_reference_audio(target_text)
            logger.info(
                "Dynamic target derived from reference audio target=%s ipa=%s",
                target_text,
                resolved_target["ipa"],
            )
            self.dynamic_target_cache[normalized_target] = resolved_target
            return resolved_target
        except Exception as exc:
            logger.warning(
                "Reference-audio target derivation also failed for target=%s reason=%s — "
                "falling back to word-boundary-only scoring",
                target_text,
                exc,
            )

        # --- Last resort: word-boundary segments, no IPA ---
        # Scoring will be rough (no phoneme alignment) but won't crash the request.
        fallback_target: dict[str, Any] = {
            "ipa": "",
            "segments": _build_segments_from_words(target_text, 0),
        }
        self.dynamic_target_cache[normalized_target] = fallback_target
        return fallback_target

    def assess(
        self,
        audio_bytes: bytes,
        target_text: str,
        filename: str | None = None,
    ) -> dict[str, Any]:
        """
        Return frontend-friendly pronunciation data.

        Replace this mock implementation with:
        1. audio normalization,
        2. phoneme decoding from the Meta Wav2Vec2 checkpoint,
        3. alignment against the target phoneme sequence,
        4. per-phoneme scoring.
        """
        duration_hint_seconds = round(max(len(audio_bytes) / 32000.0, 0.4), 2)
        self.warmup()

        if (
            not self.model_loaded
            or self.model is None
            or self.feature_extractor is None
            or not self.id_to_token
        ):
            raise RuntimeError(self.load_error or "The Wav2Vec2 model is not ready.")

        try:
            waveform = _load_audio(audio_bytes, filename=filename)
            logger.info(
                "Assessing target=%s filename=%s bytes=%s duration_hint=%s",
                target_text,
                filename,
                len(audio_bytes),
                duration_hint_seconds,
            )

            transcription = self._decode_waveform(waveform)
            practice_target = self._resolve_target_definition(target_text)
            assessment = _build_live_assessment_from_target(
                target_text,
                practice_target,
                transcription,
            )
            logger.info(
                "Assessment complete. target=%s score=%s transcript=%s",
                target_text,
                assessment["overallScore"],
                assessment["transcript"],
            )
        except Exception as exc:  # pragma: no cover - depends on local env
            logger.exception("Assessment failed")
            raise RuntimeError(f"Live model inference failed: {exc}") from exc

        assessment["durationHintSeconds"] = duration_hint_seconds
        assessment["modelReady"] = self.model_loaded
        assessment["loadError"] = self.load_error
        return assessment

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str | None = None,
    ) -> dict[str, Any]:
        duration_hint_seconds = round(max(len(audio_bytes) / 32000.0, 0.4), 2)
        self.warmup()

        if (
            not self.model_loaded
            or self.model is None
            or self.feature_extractor is None
            or not self.id_to_token
        ):
            raise RuntimeError(self.load_error or "The Wav2Vec2 model is not ready.")

        try:
            waveform = _load_audio(audio_bytes, filename=filename)
            transcription = self._decode_waveform(waveform)
            logger.info(
                "Transcription complete. filename=%s transcript=%s",
                filename,
                transcription,
            )
        except Exception as exc:  # pragma: no cover - depends on local env
            logger.exception("Transcription failed")
            raise RuntimeError(f"Live model transcription failed: {exc}") from exc

        return {
            "transcript": transcription,
            "engine": MODEL_NAME,
            "durationHintSeconds": duration_hint_seconds,
            "modelReady": self.model_loaded,
            "loadError": self.load_error,
        }
