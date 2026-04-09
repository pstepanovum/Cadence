"""
Output parsing for Qwen coach turns.

Expected formats:
  Target:  CoachMessage: <text>\nLearnerReply: <text>
  Freedom: CoachMessage: <text>

If Qwen drops the label, the raw text is used directly (first-occurrence wins,
multi-turn bleed ignored via early-stop).
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


def strip_role_prefix(value: str) -> str:
    """
    Remove 'Coach:', 'Learner:', 'CoachMessage:', 'LearnerReply:' prefixes
    that Qwen sometimes embeds inside the field value itself.
    """
    normalized = str(value or "").strip()
    normalized = re.sub(
        r"^(?:coach\s*message|coach|learner\s*reply|learner)\s*[:–-]\s*",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    return normalized.strip()


# ---------------------------------------------------------------------------
# Sanitization
# ---------------------------------------------------------------------------

def sanitize_sentence(value: Any, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip()
    return normalized or fallback


def sanitize_coach_message(value: Any, fallback: str) -> str:
    normalized = sanitize_sentence(value, fallback)
    normalized = strip_role_prefix(normalized)
    return normalized or fallback


# ---------------------------------------------------------------------------
# Labeled parser — first occurrence wins, stops early
# ---------------------------------------------------------------------------

_LABEL_PATTERN = re.compile(
    r"(?ims)(?:^|\n)\s*"
    r"(coachmessage|coach\s*message|learnerreply|learner\s*reply)"
    r"\s*[:=-]\s*"
    r"(.+?)"
    r"(?=(?:\n\s*(?:coachmessage|coach\s*message|learnerreply|learner\s*reply)\s*[:=-])|\Z)",
)


def _parse_labeled(content: str) -> dict[str, str]:
    parsed: dict[str, str] = {}

    for match in _LABEL_PATTERN.finditer(content):
        raw_key = re.sub(r"\s+", "", match.group(1).strip().lower())
        value = match.group(2).strip().strip('"')

        if raw_key == "coachmessage" and "coachMessage" not in parsed:
            parsed["coachMessage"] = strip_role_prefix(value)
        elif raw_key == "learnerreply" and "learnerReply" not in parsed:
            parsed["learnerReply"] = strip_role_prefix(value)

        # Stop as soon as we have the coach message — don't read further turns
        if "coachMessage" in parsed and (
            "learnerReply" in parsed or True  # freedom won't have learnerReply
        ):
            # For target mode, we keep going only if we haven't seen learnerReply yet
            if "learnerReply" in parsed:
                break

    return parsed


# ---------------------------------------------------------------------------
# Plain-text fallback
# Qwen sometimes omits the label prefix but the content is correct.
# ---------------------------------------------------------------------------

def _parse_plain_text(content: str, mode: str) -> dict[str, str]:
    # Strip any line that looks like a prompt echo
    lines = [
        line.strip()
        for line in content.split("\n")
        if line.strip() and not re.search(
            r"^\s*(?:topic|conversation so far|the person just said|open the conversation|respond to)",
            line,
            flags=re.IGNORECASE,
        )
    ]

    if not lines:
        return {}

    result: dict[str, str] = {"coachMessage": strip_role_prefix(lines[0])}

    if mode == "target" and len(lines) >= 2:
        result["learnerReply"] = strip_role_prefix(lines[1])

    return result


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def normalize_turn(raw: dict[str, str], mode: str) -> dict[str, str]:
    coach_message = sanitize_coach_message(raw.get("coachMessage"), "")
    if not coach_message:
        raise RuntimeError("Coach output is missing CoachMessage.")

    if mode == "freedom":
        learner_reply = ""
    else:
        learner_reply = sanitize_sentence(raw.get("learnerReply") or "", "")
        if not learner_reply:
            raise RuntimeError("Coach output is missing LearnerReply in target mode.")
        if learner_reply[-1:] not in ".!?":
            learner_reply = f"{learner_reply}."

    return {
        "coachMessage": coach_message,
        "learnerReply": learner_reply,
    }


# ---------------------------------------------------------------------------
# Top-level parser
# ---------------------------------------------------------------------------

import logging as _logging
_parse_logger = _logging.getLogger("cadence.coach_engine.parsing")


def parse_turn_response(
    decoded: str,
    mode: str,
    history: list[dict[str, Any]],
) -> dict[str, str]:
    from validation import should_reject_coach_message

    cleaned = clean_model_output(decoded)
    _parse_logger.debug("parse_turn_response cleaned:\n%s", cleaned)

    raw = _parse_labeled(cleaned)

    if not raw.get("coachMessage"):
        _parse_logger.warning(
            "No labeled CoachMessage (mode=%s), trying plain-text recovery. Output: %s",
            mode,
            cleaned[:200],
        )
        raw = _parse_plain_text(cleaned, mode)

    if not raw.get("coachMessage"):
        raise RuntimeError(
            f"Coach output could not be parsed. Raw: {cleaned[:300]}"
        )

    turn = normalize_turn(raw, mode)

    if should_reject_coach_message(turn["coachMessage"], history):
        raise RuntimeError(
            f"Coach output rejected — echoed or repeated. "
            f"coachMessage: {turn['coachMessage'][:120]}"
        )

    _parse_logger.info("Turn parsed mode=%s coach=%s", mode, turn["coachMessage"][:80])
    return turn
