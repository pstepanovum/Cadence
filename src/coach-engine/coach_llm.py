# FILE: src/coach-engine/coach_llm.py
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, __version__ as TRANSFORMERS_VERSION

logger = logging.getLogger("cadence.coach_engine")

DEFAULT_COACH_MODEL = os.getenv("COACH_LLM_MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")


def _format_support_error(message: str) -> str:
    normalized = message.strip()
    if "model type `gemma4`" in normalized or "model type 'gemma4'" in normalized:
        return (
            f"Gemma 4 is not supported by your installed Transformers build "
            f"(detected version {TRANSFORMERS_VERSION}). "
            "Update the coach environment with `pip install -U accelerate`, "
            "and install the latest Transformers source build with "
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


def _clean_model_output(content: str) -> str:
    cleaned = re.sub(r"<\|[^|]+?\|>", " ", str(content))
    cleaned = re.sub(r"</?think>", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\r\n?", "\n", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def _parse_labeled_turn(content: str) -> dict[str, str] | None:
    matches = re.finditer(
        r"(?ims)(?:^|\n)\s*(coachmessage|coach message|coach|learnerreply|learner reply|reply|cue|checkpoint)\s*[:=-]\s*(.+?)(?=(?:\n\s*(?:coachmessage|coach message|coach|learnerreply|learner reply|reply|cue|checkpoint)\s*[:=-])|\Z)",
        content,
    )

    parsed: dict[str, str] = {}
    for match in matches:
        raw_key = match.group(1).strip().lower().replace(" ", "")
        value = match.group(2).strip().strip('"')

        if raw_key in {"coachmessage", "coach"}:
            parsed["coachMessage"] = value
        elif raw_key in {"learnerreply", "reply"}:
            parsed["learnerReply"] = value
        elif raw_key == "cue":
            parsed["cue"] = value
        elif raw_key == "checkpoint":
            parsed["checkpoint"] = value

    if not parsed:
        return None

    return _coerce_turn(parsed)


def _minimal_fallback_turn(mode: str) -> dict[str, str]:
    return {
        "coachMessage": "Tell me a little more about that.",
        "learnerReply": "" if mode == "freedom" else "I can explain that in one clear sentence.",
        "cue": "Keep the pacing steady and finish clearly.",
        "checkpoint": "next turn",
    }


def _parse_turn_response(
    decoded: str,
    topic: str,
    action: str,
    mode: str,
    history: list[dict[str, Any]],
) -> dict[str, str]:
    cleaned = _clean_model_output(decoded)
    json_candidate = _extract_json_object(cleaned)

    if json_candidate:
        try:
            return _normalize_turn(_coerce_turn(json.loads(json_candidate)), mode)
        except json.JSONDecodeError:
            pass

    labeled = _parse_labeled_turn(cleaned)
    if labeled:
        return _normalize_turn(labeled, mode)

    logger.warning(
        "Coach model returned non-JSON output. Falling back to a synthetic turn. preview=%s",
        cleaned[:240],
    )
    return _normalize_turn(_minimal_fallback_turn(mode), mode)


def _sanitize_sentence(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip()
    return normalized or fallback


def _normalize_turn(turn: dict[str, str], mode: str) -> dict[str, str]:
    coach_message = _sanitize_sentence(
        turn.get("coachMessage"),
        "Tell me a little more about that.",
    )
    learner_reply = _sanitize_sentence(
        turn.get("learnerReply"),
        "" if mode == "freedom" else "I can explain that in one clear sentence.",
    )

    if learner_reply and learner_reply[-1:] not in ".!?":
        learner_reply = f"{learner_reply}."

    cue = _sanitize_sentence(
        turn.get("cue"),
        "Keep the rhythm steady and finish the last consonant clearly.",
    )
    checkpoint = _sanitize_sentence(
        turn.get("checkpoint"),
        "next reply",
    ).lower()

    return {
        "coachMessage": coach_message,
        "learnerReply": learner_reply,
        "cue": cue,
        "checkpoint": checkpoint,
    }


def _coerce_turn(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise RuntimeError("Coach response was not valid JSON.")

    return {
        "coachMessage": _sanitize_sentence(
            raw.get("coachMessage"),
            "Tell me a little more about that.",
        ),
        "learnerReply": _sanitize_sentence(
            raw.get("learnerReply") if raw.get("learnerReply") != "" else "",
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
            "You are Cadence Coach, a natural English speaking partner for pronunciation practice.",
            "Generate one conversation turn at a time for open-topic speaking.",
            "Return strict JSON with coachMessage, learnerReply, cue, and checkpoint.",
            "coachMessage should sound like a real follow-up in an ongoing conversation.",
            "In target mode, learnerReply should be one natural sentence the learner can repeat next.",
            "In freedom mode, learnerReply can be an empty string.",
            "cue should be one short pronunciation note.",
            "checkpoint should be a short lowercase label.",
            'Use this JSON shape: {"coachMessage":"...","learnerReply":"...","cue":"...","checkpoint":"..."}',
            "Return exactly one compact JSON object.",
            "No markdown and no code fences.",
        ]
    )


def _user_prompt(payload: dict[str, Any]) -> str:
    topic = str(payload.get("topic") or "").strip()
    action = str(payload.get("action") or "continue")
    mode = str(payload.get("mode") or "target").strip().lower()
    history = payload.get("history") if isinstance(payload.get("history"), list) else []

    lines = [
        f"Topic: {topic}",
        f"Action: {action}",
        f"Reply mode: {mode}",
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
            "Open the conversation naturally."
            if action == "start"
            else "Continue the conversation naturally from the latest exchange.",
            "Follow the user's direction if the topic shifts.",
            "Keep the exchange useful for spoken practice.",
        ]
    )

    return "\n".join(lines)


class GemmaCoachEngine:
    def __init__(self, model_id: str = DEFAULT_COACH_MODEL) -> None:
        self.model_id = model_id
        self.model: AutoModelForCausalLM | None = None
        self.tokenizer = None
        self.model_loaded = False
        self.load_error: str | None = None
        self.device_label = self._detect_device()
        self.last_warmup_seconds: float | None = None
        self.last_generation_seconds: float | None = None
        self.max_new_tokens = int(os.getenv("COACH_LLM_MAX_NEW_TOKENS", "220"))
        self.temperature = float(os.getenv("COACH_LLM_TEMPERATURE", "0.72"))
        self.top_p = float(os.getenv("COACH_LLM_TOP_P", "0.92"))

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
        if self.model_loaded and self.model and self.tokenizer:
            return

        load_start = time.perf_counter()
        logger.info(
            "Coach model loading model=%s device=%s",
            self.model_id,
            self.device_label,
        )

        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id, padding_side="left")
        if self.tokenizer.pad_token_id is None and self.tokenizer.eos_token is not None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

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
            "Coach model loaded model=%s device=%s elapsed=%.2fs",
            self.model_id,
            self.device_label,
            self.last_warmup_seconds,
        )

    def warmup(self, force: bool = False) -> None:
        if self.model_loaded and not force:
            return

        try:
            self._load_model()
        except Exception as exc:
            self.model_loaded = False
            self.load_error = _format_support_error(str(exc))
            logger.exception("Coach model warmup failed")

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

    def _generate_decoded(
        self,
        messages: list[dict[str, str]],
        *,
        max_new_tokens: int | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
    ) -> str:
        try:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        except TypeError:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )

        inputs = self.tokenizer(prompt, return_tensors="pt")

        if self.device_label == "mps":
            inputs = {key: value.to("mps") for key, value in inputs.items()}
        elif self.device_label == "cuda":
            inputs = {key: value.to(self.model.device) for key, value in inputs.items()}

        input_len = inputs["input_ids"].shape[-1]

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens or self.max_new_tokens,
                do_sample=True,
                temperature=self.temperature if temperature is None else temperature,
                top_p=self.top_p if top_p is None else top_p,
                repetition_penalty=1.08,
                pad_token_id=self.tokenizer.pad_token_id or self.tokenizer.eos_token_id,
            )

        return self.tokenizer.decode(
            outputs[0][input_len:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )

    def generate_turn(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.model_loaded or not self.model or not self.tokenizer:
            self.warmup(force=True)

        if not self.model_loaded or not self.model or not self.tokenizer:
            raise RuntimeError(
                self.load_error or "Coach model is not ready yet."
            )

        topic = str(payload.get("topic") or "").strip()
        history = payload.get("history") if isinstance(payload.get("history"), list) else []
        if not topic:
            raise ValueError("A topic is required to start the coach.")

        messages = [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_prompt(payload)},
        ]
        generation_start = time.perf_counter()
        decoded = self._generate_decoded(messages)
        turn = _parse_turn_response(
            decoded,
            topic=topic,
            action=str(payload.get("action") or "continue"),
            mode=str(payload.get("mode") or "target"),
            history=history,
        )

        self.last_generation_seconds = time.perf_counter() - generation_start

        logger.info(
            "Coach model generated turn model=%s device=%s elapsed=%.2fs topic=%s",
            self.model_id,
            self.device_label,
            self.last_generation_seconds,
            topic,
        )

        return {
            "provider": "local-coach",
            "model": self.model_id,
            "turn": turn,
        }
