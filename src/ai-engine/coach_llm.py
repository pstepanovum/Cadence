# FILE: src/ai-engine/coach_llm.py
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoProcessor, __version__ as TRANSFORMERS_VERSION

logger = logging.getLogger("cadence.ai_engine.coach")

DEFAULT_COACH_MODEL = os.getenv("COACH_LLM_MODEL_ID", "google/gemma-4-E4B-it")


def _format_support_error(message: str) -> str:
    normalized = message.strip()
    if "model type `gemma4`" in normalized or "model type 'gemma4'" in normalized:
        return (
            f"Gemma 4 is not supported by your installed Transformers build "
            f"(detected version {TRANSFORMERS_VERSION}). "
            "Update inside gesture-music with `pip install -U transformers accelerate`, "
            "and if that still does not add Gemma 4 support, install the latest source build with "
            "`pip install git+https://github.com/huggingface/transformers.git`."
        )
    return normalized


def _extract_json_object(content: str) -> str:
    trimmed = content.strip()

    if trimmed.startswith("{") and trimmed.endswith("}"):
        return trimmed

    fenced_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed, re.IGNORECASE)
    if fenced_match:
        return fenced_match.group(1).strip()

    first_brace = trimmed.find("{")
    last_brace = trimmed.rfind("}")
    if first_brace >= 0 and last_brace > first_brace:
        return trimmed[first_brace : last_brace + 1]

    return trimmed


def _sanitize_sentence(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip()
    return normalized or fallback


def _coerce_turn(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise RuntimeError("Coach response was not valid JSON.")

    return {
        "coachMessage": _sanitize_sentence(
            raw.get("coachMessage"),
            "Tell me a little more about that.",
        ),
        "learnerReply": _sanitize_sentence(
            raw.get("learnerReply"),
            "I can explain that in a simple way.",
        ),
        "cue": _sanitize_sentence(
            raw.get("cue"),
            "Keep the rhythm steady and finish the last consonant clearly.",
        ),
        "checkpoint": _sanitize_sentence(
            raw.get("checkpoint"),
            "next reply",
        ).lower(),
    }


def _serialize_history(history: list[dict[str, Any]]) -> str:
    if not history:
        return "No previous turns yet."

    lines: list[str] = []
    for index, entry in enumerate(history[-10:], start=1):
        details = [
            f"cue={entry['cue']}" if entry.get("cue") else None,
            f"score={entry['score']}" if isinstance(entry.get("score"), (int, float)) else None,
            f"transcript={entry['transcript']}" if entry.get("transcript") else None,
        ]
        detail_text = " | ".join(item for item in details if item)
        content = str(entry.get("content") or "").strip()
        role = str(entry.get("role") or "user").upper()
        lines.append(
            f"{index}. {role}: {content}{f' [{detail_text}]' if detail_text else ''}"
        )
    return "\n".join(lines)


def _system_prompt() -> str:
    return " ".join(
        [
            "You are Cadence Coach, an English pronunciation coach for intermediate non-native speakers.",
            "Generate one conversation turn at a time for open-topic speaking practice.",
            "Return strict JSON with coachMessage, learnerReply, cue, and checkpoint.",
            "coachMessage must be one or two short natural sentences that continue the conversation.",
            "learnerReply must be exactly one sentence the learner should say next, ideally 8 to 18 words.",
            "cue must be one short pronunciation note focused on one to three sound targets inside learnerReply.",
            "checkpoint must be a short lowercase label describing the current part of the conversation.",
            "Keep the tone warm, practical, and useful for B1 to B2 learners.",
            "If the last pronunciation score is below 70, make learnerReply shorter and easier.",
            "If the last pronunciation score is above 85, you can make learnerReply slightly richer.",
            "Do not use bullet points, markdown, or extra commentary.",
            "Do not wrap the JSON in code fences.",
        ]
    )


def _user_prompt(payload: dict[str, Any]) -> str:
    topic = str(payload.get("topic") or "").strip()
    action = str(payload.get("action") or "continue")
    history = payload.get("history") if isinstance(payload.get("history"), list) else []

    lines = [
        f"Topic: {topic}",
        f"Action: {action}",
        "Conversation history:",
        _serialize_history(history),
    ]

    latest_assessment = payload.get("latestAssessment")
    if isinstance(latest_assessment, dict):
        lines.extend(
            [
                "Latest pronunciation assessment:",
                f"target={latest_assessment.get('targetText', '')}",
                f"transcript={latest_assessment.get('transcript', '')}",
                f"score={latest_assessment.get('overallScore', '')}",
                f"summary={latest_assessment.get('summary', '')}",
                f"nextStep={latest_assessment.get('nextStep', '')}",
            ]
        )

    lines.extend(
        [
            "Goal:",
            "Open the conversation with a coach message and give the learner a natural first reply to practice."
            if action == "start"
            else "Continue the same topic naturally and give the learner a fresh next reply to practice.",
        ]
    )

    return "\n".join(lines)


class GemmaCoachEngine:
    def __init__(self, model_id: str = DEFAULT_COACH_MODEL) -> None:
        self.model_id = model_id
        self.model: AutoModelForCausalLM | None = None
        self.processor: AutoProcessor | None = None
        self.model_loaded = False
        self.load_error: str | None = None
        self.device_label = self._detect_device()
        self.last_warmup_seconds: float | None = None
        self.last_generation_seconds: float | None = None
        self.max_new_tokens = int(os.getenv("COACH_LLM_MAX_NEW_TOKENS", "220"))
        self.temperature = float(os.getenv("COACH_LLM_TEMPERATURE", "0.8"))
        self.top_p = float(os.getenv("COACH_LLM_TOP_P", "0.95"))

    def _detect_device(self) -> str:
        forced = os.getenv("COACH_LLM_DEVICE", "").strip().lower()
        if forced:
            return forced
        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _load_model(self) -> None:
        if self.model_loaded and self.model and self.processor:
            return

        load_start = time.perf_counter()
        logger.info(
            "Gemma coach loading model=%s device=%s",
            self.model_id,
            self.device_label,
        )

        self.processor = AutoProcessor.from_pretrained(self.model_id)

        if self.device_label == "cuda":
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                torch_dtype="auto",
                device_map="auto",
            )
        elif self.device_label == "mps":
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                torch_dtype=torch.float16,
            )
            self.model.to("mps")
        else:
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                torch_dtype=torch.float32,
            )

        self.model.eval()
        self.model_loaded = True
        self.load_error = None
        self.last_warmup_seconds = time.perf_counter() - load_start
        logger.info(
            "Gemma coach loaded model=%s device=%s elapsed=%.2fs",
            self.model_id,
            self.device_label,
            self.last_warmup_seconds,
        )

    def warmup(self, force: bool = False) -> None:
        if self.model_loaded and not force:
            return

        try:
            self._load_model()
        except Exception as exc:  # pragma: no cover - environment specific
            self.model_loaded = False
            self.load_error = _format_support_error(str(exc))
            logger.exception("Gemma coach warmup failed")

    def get_status(self) -> dict[str, Any]:
        return {
            "coachReady": self.model_loaded,
            "coachModel": self.model_id,
            "coachDevice": self.device_label,
            "coachLoadError": self.load_error,
            "coachTransformersVersion": TRANSFORMERS_VERSION,
            "coachLastWarmupSeconds": self.last_warmup_seconds,
            "coachLastGenerationSeconds": self.last_generation_seconds,
        }

    def generate_turn(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.model_loaded or not self.model or not self.processor:
            self.warmup(force=True)

        if not self.model_loaded or not self.model or not self.processor:
            raise RuntimeError(
                self.load_error or "Gemma coach model is not ready yet."
            )

        topic = str(payload.get("topic") or "").strip()
        if not topic:
            raise ValueError("A topic is required to start the coach.")

        messages = [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_prompt(payload)},
        ]

        try:
            prompt = self.processor.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        except TypeError:
            prompt = self.processor.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )

        inputs = self.processor(text=prompt, return_tensors="pt")

        if self.device_label == "mps":
            inputs = {key: value.to("mps") for key, value in inputs.items()}
        elif self.device_label == "cuda":
            inputs = {key: value.to(self.model.device) for key, value in inputs.items()}

        input_len = inputs["input_ids"].shape[-1]
        generation_start = time.perf_counter()

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                do_sample=True,
                temperature=self.temperature,
                top_p=self.top_p,
                pad_token_id=self.processor.tokenizer.eos_token_id,
            )

        decoded = self.processor.decode(
            outputs[0][input_len:],
            skip_special_tokens=False,
        )

        try:
            parsed = self.processor.parse_response(decoded)
        except Exception:
            parsed = decoded

        if isinstance(parsed, dict):
            maybe_text = parsed.get("text") or parsed.get("response")
            response_text = maybe_text if isinstance(maybe_text, str) else json.dumps(parsed)
        else:
            response_text = str(parsed)

        turn = _coerce_turn(json.loads(_extract_json_object(response_text)))
        self.last_generation_seconds = time.perf_counter() - generation_start

        logger.info(
            "Gemma coach generated turn model=%s device=%s elapsed=%.2fs topic=%s",
            self.model_id,
            self.device_label,
            self.last_generation_seconds,
            topic,
        )

        return {
            "provider": "gemma-local",
            "model": self.model_id,
            "turn": turn,
        }
