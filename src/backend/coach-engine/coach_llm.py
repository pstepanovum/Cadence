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


def _repair_json_candidate(content: str) -> str:
    repaired = content.strip()
    repaired = re.sub(
        r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)',
        r'\1"\2"\3',
        repaired,
    )
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    return repaired


def _clean_model_output(content: str) -> str:
    cleaned = re.sub(r"<\|[^|]+?\|>", " ", str(content))
    cleaned = re.sub(r"</?think>", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\r\n?", "\n", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def _latest_history_content(
    history: list[dict[str, Any]],
    role: str,
) -> str:
    for entry in reversed(history):
        if str(entry.get("role") or "").lower() != role:
            continue

        content = re.sub(r"\s+", " ", str(entry.get("content") or "")).strip()
        if content:
            return content
    return ""


def _truncate_sentence(value: str, *, limit: int = 140) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    if not normalized:
        return normalized

    if len(normalized) <= limit:
        return normalized

    shortened = normalized[:limit].rsplit(" ", 1)[0].strip()
    return shortened or normalized[:limit].strip()


def _summarize_user_content(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value).strip()
    if not normalized:
        return normalized

    first_clause = re.split(r"[?.!]", normalized, maxsplit=1)[0].strip()
    return _truncate_sentence(first_clause or normalized, limit=72)


def _looks_like_plain_coach_message(content: str) -> bool:
    candidate = content.strip()
    if not candidate:
        return False

    lowered = candidate.lower()
    if (
        candidate.startswith("{")
        or "coachmessage" in lowered
        or "learnerreply" in lowered
        or lowered.startswith("coach:")
        or lowered.startswith("next step:")
        or lowered.startswith("cue:")
        or lowered.startswith("checkpoint:")
        or "[transcript=" in lowered
    ):
        return False

    return True


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

    coach_message = parsed.get("coachMessage")
    if coach_message:
        inline_bracket_cue = re.search(
            r"\[\s*cue\s*=\s*([^\]]+?)\s*\]",
            coach_message,
            flags=re.IGNORECASE,
        )
        inline_cue = re.search(
            r"\bCue\s*:\s*(.+?)(?=\bCheckpoint\s*:|\Z)",
            coach_message,
            flags=re.IGNORECASE,
        )
        inline_checkpoint_text = re.search(
            r"\bCheckpoint\s*:\s*(.+?)\s*$",
            coach_message,
            flags=re.IGNORECASE,
        )
        inline_checkpoint = re.search(
            r"\[\s*checkpoint\s*:\s*([^\]]+?)\s*\]",
            coach_message,
            flags=re.IGNORECASE,
        )
        if inline_bracket_cue and not parsed.get("cue"):
            parsed["cue"] = inline_bracket_cue.group(1).strip()
        if inline_cue and not parsed.get("cue"):
            parsed["cue"] = inline_cue.group(1).strip()
        if inline_checkpoint_text and not parsed.get("checkpoint"):
            parsed["checkpoint"] = inline_checkpoint_text.group(1).strip()
        if inline_checkpoint and not parsed.get("checkpoint"):
            parsed["checkpoint"] = inline_checkpoint.group(1).strip()

        cleaned_message = re.sub(
            r"\[\s*checkpoint\s*:\s*[^\]]+?\s*\]",
            "",
            coach_message,
            flags=re.IGNORECASE,
        )
        cleaned_message = re.sub(
            r"\[\s*transcript\s*=\s*[^\]]+?\s*\]",
            "",
            cleaned_message,
            flags=re.IGNORECASE,
        )
        cleaned_message = re.sub(
            r"\[\s*cue\s*=\s*[^\]]+?\s*\]",
            "",
            cleaned_message,
            flags=re.IGNORECASE,
        )
        cleaned_message = re.sub(
            r"\bCue\s*:\s*.+?(?=\bCheckpoint\s*:|\Z)",
            "",
            cleaned_message,
            flags=re.IGNORECASE,
        )
        cleaned_message = re.sub(
            r"\bCheckpoint\s*:\s*.+$",
            "",
            cleaned_message,
            flags=re.IGNORECASE,
        )
        cleaned_message = re.sub(
            r"\bLearnerReply\s*:\s*$",
            "",
            cleaned_message,
            flags=re.IGNORECASE,
        )
        parsed["coachMessage"] = cleaned_message.strip()

    return _coerce_turn(parsed)


def _build_contextual_fallback_turn(
    *,
    topic: str,
    action: str,
    mode: str,
    history: list[dict[str, Any]],
    latest_assessment: dict[str, Any] | None = None,
    draft_coach_message: str | None = None,
) -> dict[str, str]:
    latest_user = _latest_history_content(history, "user")
    normalized_topic = _truncate_sentence(topic, limit=72)
    normalized_user = _summarize_user_content(latest_user)

    if draft_coach_message and _looks_like_plain_coach_message(draft_coach_message):
        coach_message = _truncate_sentence(draft_coach_message)
        if coach_message[-1:] not in ".!?":
            coach_message = f"{coach_message}."
    elif action == "start":
        coach_message = (
            f"Let's start with {normalized_topic}. What part of it matters most to you right now?"
            if normalized_topic
            else "What would you like to talk through first?"
        )
    elif normalized_user:
        coach_message = (
            f"That makes sense. In a real conversation, what do you want people to notice first when you say, \"{normalized_user}\"?"
        )
    else:
        coach_message = (
            f"Stay with {normalized_topic} for a moment. What's the main idea you want to get across?"
            if normalized_topic
            else "What do you want to explain more clearly next?"
        )

    next_step = ""
    score = None
    if isinstance(latest_assessment, dict):
        next_step = re.sub(
            r"\s+",
            " ",
            str(latest_assessment.get("nextStep") or ""),
        ).strip()
        try:
            score = float(latest_assessment.get("overallScore"))
        except (TypeError, ValueError):
            score = None

    if next_step:
        cue = _truncate_sentence(next_step, limit=96)
    elif isinstance(score, (int, float)) and score < 75:
        cue = "Slow down a touch and finish the key sounds cleanly."
    elif normalized_topic:
        cue = f"Keep your phrasing steady while you explain {normalized_topic.lower()}."
    else:
        cue = "Keep your pacing steady and finish the thought clearly."

    if mode == "freedom":
        learner_reply = ""
    elif normalized_user:
        learner_reply = f"I want to explain it clearly and use confident body language."
    elif normalized_topic:
        learner_reply = f"I want to explain {normalized_topic.lower()} in a clear and confident way."
    else:
        learner_reply = "I want to explain this clearly and confidently."

    checkpoint = "next reply" if action == "continue" else "opening turn"

    return {
        "coachMessage": coach_message,
        "learnerReply": learner_reply,
        "cue": cue,
        "checkpoint": checkpoint,
    }


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
    latest_assessment: dict[str, Any] | None = None,
) -> dict[str, str]:
    cleaned = _clean_model_output(decoded)
    json_candidate = _extract_json_object(cleaned)

    if json_candidate:
        try:
            parsed_turn = _normalize_turn(_coerce_turn(json.loads(json_candidate)), mode)
            if not _is_echoed_user_message(parsed_turn["coachMessage"], history):
                return parsed_turn
        except json.JSONDecodeError:
            repaired_json = _repair_json_candidate(json_candidate)
            if repaired_json != json_candidate:
                try:
                    parsed_turn = _normalize_turn(
                        _coerce_turn(json.loads(repaired_json)),
                        mode,
                    )
                    if not _is_echoed_user_message(parsed_turn["coachMessage"], history):
                        return parsed_turn
                except json.JSONDecodeError:
                    pass

    labeled = _parse_labeled_turn(cleaned)
    if labeled:
        parsed_turn = _normalize_turn(labeled, mode)
        if not _is_echoed_user_message(parsed_turn["coachMessage"], history):
            return parsed_turn

    if _looks_like_plain_coach_message(cleaned):
        logger.warning(
            "Coach model returned plain text instead of structured output. Recovering a contextual turn. preview=%s",
            cleaned[:240],
        )
        return _normalize_turn(
            _build_contextual_fallback_turn(
                topic=topic,
                action=action,
                mode=mode,
                history=history,
                latest_assessment=latest_assessment,
                draft_coach_message=cleaned,
            ),
            mode,
        )

    logger.warning(
        "Coach model returned non-JSON output. Falling back to a synthetic turn. preview=%s",
        cleaned[:240],
    )
    return _normalize_turn(
        _build_contextual_fallback_turn(
            topic=topic,
            action=action,
            mode=mode,
            history=history,
            latest_assessment=latest_assessment,
        ),
        mode,
    )


def _sanitize_sentence(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip()
    return normalized or fallback


def _sanitize_coach_message(value: Any, fallback: str) -> str:
    normalized = _sanitize_sentence(value, fallback)
    normalized = re.sub(
        r"\[\s*checkpoint\s*:\s*[^\]]+?\s*\]",
        "",
        normalized,
        flags=re.IGNORECASE,
    ).strip()
    normalized = re.sub(
        r"\[\s*transcript\s*=\s*[^\]]+?\s*\]",
        "",
        normalized,
        flags=re.IGNORECASE,
    ).strip()
    return normalized or fallback


def _is_echoed_user_message(coach_message: str, history: list[dict[str, Any]]) -> bool:
    latest_user = _latest_history_content(history, "user")
    if not latest_user:
        return False

    def normalize(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

    normalized_coach = normalize(coach_message)
    normalized_user = normalize(latest_user)
    if not normalized_coach or not normalized_user:
        return False

    return normalized_coach.startswith(normalized_user)


def _normalize_turn(turn: dict[str, str], mode: str) -> dict[str, str]:
    coach_message = _sanitize_coach_message(
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
        "coachMessage": _sanitize_coach_message(
            raw.get("coachMessage"),
            "",
        ),
        "learnerReply": _sanitize_sentence(
            raw.get("learnerReply") if raw.get("learnerReply") != "" else "",
            "",
        ),
        "cue": _sanitize_sentence(
            raw.get("cue"),
            "",
        ),
        "checkpoint": _sanitize_sentence(
            raw.get("checkpoint"),
            "",
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
            "Return exactly four lines with these labels: CoachMessage, LearnerReply, Cue, Checkpoint.",
            "coachMessage should sound like a real follow-up in an ongoing conversation.",
            "In target mode, learnerReply should be one natural sentence the learner can repeat next.",
            "In freedom mode, learnerReply can be an empty string.",
            "cue should be one short pronunciation note.",
            "checkpoint should be a short lowercase label.",
            "Do not explain the format and do not add markdown or code fences.",
            "Example:",
            "CoachMessage: What part of that feels most important to you?",
            "LearnerReply: I want to explain the main idea clearly.",
            "Cue: Keep the key words steady and clear.",
            "Checkpoint: next reply",
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
        logger.info("Coach raw model output preview=%s", _clean_model_output(decoded)[:240])
        turn = _parse_turn_response(
            decoded,
            topic=topic,
            action=str(payload.get("action") or "continue"),
            mode=str(payload.get("mode") or "target"),
            history=history,
            latest_assessment=payload.get("latestAssessment")
            if isinstance(payload.get("latestAssessment"), dict)
            else None,
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
