"""
Output parsing and sanitization.

Qwen returns plain labeled text — no JSON.  We parse it with regex.
"""
from __future__ import annotations

import re
from typing import Any


# ---------------------------------------------------------------------------
# Cleaning
# ---------------------------------------------------------------------------

def clean_model_output(content: str) -> str:
    cleaned = re.sub(r"<\|[^|]+?\|>", " ", str(content))
    cleaned = re.sub(r"</?think>", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\r\n?", "\n", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def strip_inline_coach_annotations(value: str) -> str:
    normalized = str(value or "")
    normalized = re.sub(r"\[\s*checkpoint\s*:\s*[^\]]+?\s*\]", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\[\s*transcript\s*=\s*[^\]]+?\s*\]", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\[\s*cue\s*=\s*[^\]]+?\s*\]", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(
        r"\bCue\s*:\s*.+?(?=\bCheckpoint\s*:|\Z)", "", normalized, flags=re.IGNORECASE
    )
    normalized = re.sub(r"\bCheckpoint\s*:\s*.+$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bLearnerReply\s*:\s*$", "", normalized, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", normalized).strip()


# ---------------------------------------------------------------------------
# Sanitization
# ---------------------------------------------------------------------------

def sanitize_sentence(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip()
    return normalized or fallback


def sanitize_coach_message(value: Any, fallback: str) -> str:
    normalized = sanitize_sentence(value, fallback)
    normalized = strip_inline_coach_annotations(normalized)
    return normalized or fallback


# ---------------------------------------------------------------------------
# Labeled-text parser (primary format Qwen produces)
# ---------------------------------------------------------------------------

_LABEL_PATTERN = re.compile(
    r"(?ims)(?:^|\n)\s*"
    r"(coachmessage|coach\s*message|coach|learnerreply|learner\s*reply|reply|cue|checkpoint)"
    r"\s*[:=-]\s*"
    r"(.+?)"
    r"(?=(?:\n\s*(?:coachmessage|coach\s*message|coach|learnerreply|learner\s*reply|reply|cue|checkpoint)\s*[:=-])|\Z)",
)


def _parse_labeled_turn(content: str) -> dict[str, str] | None:
    parsed: dict[str, str] = {}

    for match in _LABEL_PATTERN.finditer(content):
        raw_key = re.sub(r"\s+", "", match.group(1).strip().lower())
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

    # Pull inline cue / checkpoint out of coachMessage if present
    coach_message = parsed.get("coachMessage", "")
    if coach_message:
        for pattern, key in (
            (r"\[\s*cue\s*=\s*([^\]]+?)\s*\]", "cue"),
            (r"\bCue\s*:\s*(.+?)(?=\bCheckpoint\s*:|\Z)", "cue"),
            (r"\[\s*checkpoint\s*:\s*([^\]]+?)\s*\]", "checkpoint"),
            (r"\bCheckpoint\s*:\s*(.+?)\s*$", "checkpoint"),
        ):
            m = re.search(pattern, coach_message, flags=re.IGNORECASE)
            if m and not parsed.get(key):
                parsed[key] = m.group(1).strip()

        parsed["coachMessage"] = strip_inline_coach_annotations(coach_message)

    return _coerce_turn(parsed)


# ---------------------------------------------------------------------------
# Inline-annotated parser
# Handles output like:
#   Hi! How was your weekend?
#   (Cue: stress the first syllable)
# where Qwen writes the cue/checkpoint as parenthetical annotations rather
# than as standalone labeled lines.
# ---------------------------------------------------------------------------

_INLINE_CUE_RE = re.compile(
    r"\(\s*(?:pronunciation\s*)?cue\s*[:\-]\s*([^)]+)\)",
    re.IGNORECASE,
)
_INLINE_CHECKPOINT_RE = re.compile(
    r"\(\s*checkpoint\s*[:\-]\s*([^)]+)\)",
    re.IGNORECASE,
)
_INLINE_LEARNER_REPLY_RE = re.compile(
    r"(?m)^\s*(?:learnerreply|learner\s*reply|reply)\s*[:=-]\s*(.+?)$",
    re.IGNORECASE,
)


def _parse_inline_annotated_turn(content: str) -> dict[str, str] | None:
    cue_match = _INLINE_CUE_RE.search(content)
    checkpoint_match = _INLINE_CHECKPOINT_RE.search(content)
    reply_match = _INLINE_LEARNER_REPLY_RE.search(content)

    # Need at least a cue annotation to treat this as a structured output
    if not cue_match and not checkpoint_match:
        return None

    # Strip all annotations from the text to isolate the coach message
    coach_raw = content
    # Remove in reverse index order so slicing stays valid
    removals = sorted(
        [m for m in (cue_match, checkpoint_match, reply_match) if m],
        key=lambda m: m.start(),
        reverse=True,
    )
    for m in removals:
        coach_raw = coach_raw[: m.start()] + coach_raw[m.end() :]

    coach_raw = re.sub(r"\s+", " ", coach_raw).strip()

    return {
        "coachMessage": sanitize_coach_message(coach_raw, ""),
        "learnerReply": sanitize_sentence(reply_match.group(1) if reply_match else "", ""),
        "cue": sanitize_sentence(cue_match.group(1) if cue_match else (checkpoint_match.group(1) if checkpoint_match else ""), ""),
        "checkpoint": sanitize_sentence(checkpoint_match.group(1) if checkpoint_match else "", "").lower(),
    }


# ---------------------------------------------------------------------------
# Normalization and coercion
# ---------------------------------------------------------------------------

def _coerce_turn(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise RuntimeError("Coach response was not a valid turn dict.")
    return {
        "coachMessage": sanitize_coach_message(raw.get("coachMessage"), ""),
        "learnerReply": sanitize_sentence(raw.get("learnerReply") or "", ""),
        "cue": sanitize_sentence(raw.get("cue"), ""),
        "checkpoint": sanitize_sentence(raw.get("checkpoint"), "").lower(),
    }


def normalize_turn(turn: dict[str, str], mode: str) -> dict[str, str]:
    coach_message = sanitize_coach_message(turn.get("coachMessage"), "")
    if not coach_message:
        raise RuntimeError("Coach response is missing coachMessage.")

    learner_reply = "" if mode == "freedom" else sanitize_sentence(turn.get("learnerReply"), "")
    if mode != "freedom" and not learner_reply:
        raise RuntimeError("Coach response is missing learnerReply in target mode.")
    if learner_reply and learner_reply[-1:] not in ".!?":
        learner_reply = f"{learner_reply}."

    cue = sanitize_sentence(turn.get("cue"), "")
    if not cue:
        raise RuntimeError("Coach response is missing cue.")

    checkpoint = sanitize_sentence(turn.get("checkpoint"), "").lower()
    if not checkpoint:
        raise RuntimeError("Coach response is missing checkpoint.")

    return {
        "coachMessage": coach_message,
        "learnerReply": learner_reply,
        "cue": cue,
        "checkpoint": checkpoint,
    }


# ---------------------------------------------------------------------------
# Top-level parser (called from model.py)
# ---------------------------------------------------------------------------

import logging as _logging
_parse_logger = _logging.getLogger("cadence.coach_engine.parsing")


def parse_turn_response(
    decoded: str,
    mode: str,
    history: list[dict[str, Any]],
) -> dict[str, str]:
    from validation import looks_like_prompt_echo, should_reject_coach_message  # avoid circular

    cleaned = clean_model_output(decoded)
    _parse_logger.debug("parse_turn_response cleaned output: %s", cleaned)

    # --- Primary path: labeled output (CoachMessage: / LearnerReply: / ...) ---
    labeled = _parse_labeled_turn(cleaned)
    if labeled:
        turn = normalize_turn(labeled, mode)
        if should_reject_coach_message(turn["coachMessage"], history):
            _parse_logger.warning(
                "Labeled turn rejected (echoed prompt / repeated / low-info). "
                "Falling through to retry. coachMessage=%s",
                turn["coachMessage"][:120],
            )
            raise RuntimeError(
                "Coach output rejected: echoed or low-information reply. "
                f"coachMessage preview: {turn['coachMessage'][:120]}"
            )
        return turn

    # --- Secondary path: inline-annotated output  e.g. "(Cue: stress ...)" ---
    inline = _parse_inline_annotated_turn(cleaned)
    if inline:
        _parse_logger.info(
            "Inline-annotated turn parsed (mode=%s) coachMessage=%s cue=%s checkpoint=%s",
            mode,
            inline.get("coachMessage", "")[:80],
            inline.get("cue", ""),
            inline.get("checkpoint", ""),
        )
        try:
            turn = normalize_turn(inline, mode)
        except RuntimeError:
            inline["cue"] = inline.get("cue") or "speak clearly and naturally"
            inline["checkpoint"] = inline.get("checkpoint") or "open response"
            turn = normalize_turn(inline, "freedom")

        # In fallback paths only reject clear structural prompt echoes, not semantic
        # issues — the model already failed to follow format, so we're lenient.
        if not looks_like_prompt_echo(turn["coachMessage"]):
            if mode != "freedom":
                _parse_logger.warning(
                    "Inline-annotated fallback used in target mode — learnerReply will be empty. "
                    "coachMessage=%s",
                    turn["coachMessage"],
                )
            return turn

    # --- Tertiary fallback: Qwen returned bare plain text, no labels or annotations ---
    candidate = cleaned.strip()
    _parse_logger.warning(
        "No labeled or annotated lines found (mode=%s). "
        "Attempting plain-text fallback. Full output: %s",
        mode,
        candidate,
    )

    if candidate and not looks_like_prompt_echo(candidate):
        # Take just the first sentence to avoid multi-paragraph noise
        first_sentence_match = re.search(r"^[^.!?\n]+[.!?]?", candidate)
        coach_message = sanitize_coach_message(
            first_sentence_match.group(0) if first_sentence_match else candidate,
            "",
        )

        if coach_message:
            turn = normalize_turn(
                {
                    "coachMessage": coach_message,
                    "learnerReply": "",
                    "cue": "speak clearly and naturally",
                    "checkpoint": "open response",
                },
                "freedom",  # skip learnerReply requirement regardless of actual mode
            )
            # Only gate on structural prompt echo, not semantic checks
            if not looks_like_prompt_echo(turn["coachMessage"]):
                if mode != "freedom":
                    _parse_logger.warning(
                        "Plain-text fallback used in target mode — learnerReply will be empty. "
                        "coachMessage=%s",
                        turn["coachMessage"],
                    )
                return turn

    raise RuntimeError(
        f"Coach model output could not be parsed. "
        f"The response did not contain recognizable labeled lines "
        f"(CoachMessage / LearnerReply / Cue / Checkpoint) and "
        f"appeared to be a structural prompt echo. "
        f"Full output: {cleaned}"
    )
