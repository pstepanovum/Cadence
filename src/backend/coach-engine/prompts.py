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
        "You are having a casual spoken conversation with someone.\n"
        "The topic is given. You MUST talk about that topic — never comment on speaking, language, or pronunciation.\n"
        "\n"
        "Output EXACTLY two lines, then stop:\n"
        "\n"
        "CoachMessage: <your question or comment about the topic — under 20 words>\n"
        "LearnerReply: <a natural first-person reply the speaker will say — under 16 words, ends with . ! or ?>\n"
        "\n"
        "Hard rules:\n"
        "- CoachMessage MUST be about the topic. If a learner message exists, respond to it directly.\n"
        "- Never say 'let's practice', 'good job', 'you are speaking well', or any language feedback.\n"
        "- Do NOT write 'Coach:' or 'Learner:' inside the line values.\n"
        "- LearnerReply is first-person: 'I think...', 'That's...', 'I agree...'\n"
        "- Two lines only. Nothing before or after."
    )


def freedom_system_prompt() -> str:
    return (
        "You are having a casual spoken conversation with someone.\n"
        "The topic is given. You MUST talk about that topic — never comment on speaking, language, or pronunciation.\n"
        "\n"
        "Output EXACTLY one line, then stop:\n"
        "\n"
        "CoachMessage: <your question or comment about the topic — under 20 words>\n"
        "\n"
        "Hard rules:\n"
        "- CoachMessage MUST be about the topic. If a learner message exists, respond to it directly.\n"
        "- Never say 'let's practice', 'good job', 'you are speaking well', or any language feedback.\n"
        "- Do NOT write 'Coach:' inside the line value.\n"
        "- One line only. Nothing before or after."
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
            "\n"
            f"Open the conversation with a specific question or comment about: {topic}\n"
            "Do not use a generic greeting. Engage with the topic immediately."
        )

    latest_user = latest_history_content(history, "user")
    lines = [f"Topic: {topic}", ""]
    if serialized:
        lines += ["Conversation so far:", serialized, ""]
    if latest_user:
        lines.append(f"The person just said: {latest_user}")
    lines.append(f"Respond to what they said and keep the conversation about: {topic}")
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
