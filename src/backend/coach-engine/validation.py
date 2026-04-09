"""
Validation helpers: detect echoed / repeated coach turns.
"""
from __future__ import annotations

import re
from typing import Any


def latest_history_content(history: list[dict[str, Any]], role: str) -> str:
    for entry in reversed(history):
        if str(entry.get("role") or "").lower() != role:
            continue
        content = re.sub(r"\s+", " ", str(entry.get("content") or "")).strip()
        if content:
            return content
    return ""


def normalize_for_match(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def looks_like_prompt_echo(content: str) -> bool:
    """True if the coach output appears to be an echo of the prompt itself."""
    lowered = str(content or "").strip().lower()
    if not lowered:
        return False
    return any(
        re.search(pattern, lowered)
        for pattern in (
            r"\btopic\s*:",
            r"\baction\s*:",
            r"\blearner mode\s*:",
            r"\breply mode\b",
            r"\bcoachmessage\b",
            r"\blearnerreply\b",
            r"\bconversation so far\b",
            r"\bopen the conversation\b",
            r"\bcontinue the conversation\b",
        )
    )


def is_echoed_user_message(coach_message: str, history: list[dict[str, Any]]) -> bool:
    """True if the coach message is just a repeat of what the learner said."""
    latest_user = latest_history_content(history, "user")
    if not latest_user:
        return False
    norm_coach = normalize_for_match(coach_message)
    norm_user = normalize_for_match(latest_user)
    if not norm_coach or not norm_user:
        return False
    return norm_coach.startswith(norm_user)


def is_repeated_coach_message(coach_message: str, history: list[dict[str, Any]]) -> bool:
    """True if Qwen produced the same message as the previous coach turn."""
    latest_coach = latest_history_content(history, "coach")
    if not latest_coach:
        return False
    norm_new = normalize_for_match(coach_message)
    norm_old = normalize_for_match(latest_coach)
    if not norm_new or not norm_old:
        return False
    if norm_new == norm_old:
        return True
    if len(norm_new) < 36 or len(norm_old) < 36:
        return False
    return norm_new.startswith(norm_old) or norm_old.startswith(norm_new)


def should_reject_coach_message(coach_message: str, history: list[dict[str, Any]]) -> bool:
    from parsing import sanitize_coach_message
    normalized = sanitize_coach_message(coach_message, "")
    if not normalized:
        return True
    return (
        looks_like_prompt_echo(coach_message)
        or is_echoed_user_message(normalized, history)
        or is_repeated_coach_message(normalized, history)
    )
