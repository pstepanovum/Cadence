"""
Light validation: empty coach lines, prompt-template leaks, verbatim repeat of last coach line.
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


def should_reject_coach_message(coach_message: str, history: list[dict[str, Any]]) -> bool:
    """
    Keep checks minimal so small models are not blocked on valid short replies
    (e.g. learner said "Sure" and coach said "Sure, how about you?" — old logic
    treated that as an "echo" because the coach string started with the user string).
    """
    from parsing import sanitize_coach_message

    normalized = sanitize_coach_message(coach_message, "")
    if not normalized:
        return True
    if looks_like_prompt_echo(coach_message):
        return True
    # Only reject a verbatim repeat of the *previous coach line*, not prefix overlap.
    latest_coach = latest_history_content(history, "coach")
    if latest_coach:
        if normalize_for_match(normalized) == normalize_for_match(latest_coach):
            return True
    return False
