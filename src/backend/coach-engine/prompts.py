"""
Prompt builders for Qwen coach turns.

Target mode output — exactly two lines:
    CoachMessage: <text>
    LearnerReply: <text>

Freedom mode output — exactly one line:
    CoachMessage: <text>
"""
from __future__ import annotations

from typing import Any

from validation import latest_history_content


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

def target_system_prompt() -> str:
    return (
        "You are a friendly coach in a spoken chat. Stay on the topic you are given.\n"
        "Do not talk about pronunciation, accents, or English practice.\n"
        "\n"
        "TARGET mode — reply with exactly these two lines and nothing else:\n"
        "CoachMessage: <short line, question or comment on the topic>\n"
        "LearnerReply: <one short sentence the human could say next, first person, ends with . ? or !>\n"
        "\n"
        "Do not add labels other than CoachMessage and LearnerReply. No extra text."
    )


def freedom_system_prompt() -> str:
    return (
        "You are a friendly coach in a spoken chat. Stay on the topic you are given.\n"
        "Do not talk about pronunciation, accents, or English practice.\n"
        "\n"
        "FREEDOM mode — reply with exactly one line and nothing else:\n"
        "CoachMessage: <short line, question or comment on the topic>\n"
        "\n"
        "Do not add any other labels or lines."
    )


# ---------------------------------------------------------------------------
# User prompt (shared structure)
# ---------------------------------------------------------------------------

def _serialize_history(history: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for entry in history[-8:]:
        role = str(entry.get("role") or "user").capitalize()
        content = str(entry.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else ""


def _user_prompt(payload: dict[str, Any]) -> str:
    topic = str(payload.get("topic") or "").strip() or "open discussion"
    action = str(payload.get("action") or "continue")
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    serialized = _serialize_history(history)

    if action == "start":
        return (
            f"Topic: {topic}\n"
            f"Ask one specific question about this topic (not a generic hello only)."
        )

    latest_user = latest_history_content(history, "user")
    lines = [f"Topic: {topic}", ""]
    if serialized:
        lines += [serialized, ""]
    if latest_user:
        lines.append(f"They said: {latest_user}")
    lines.append("Answer them and move the topic forward in one coach line.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public: build messages list for model.generate
# ---------------------------------------------------------------------------

def build_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    mode = str(payload.get("mode") or "target").strip().lower()
    system = freedom_system_prompt() if mode == "freedom" else target_system_prompt()
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": _user_prompt(payload)},
    ]
