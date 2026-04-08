"""
Prompt builders for Qwen coach turns.

Qwen is NOT asked to produce JSON.  It returns plain labeled text:

    CoachMessage: <text>
    LearnerReply: <text>
    Cue: <text>
    Checkpoint: <text>

This is far more reliable for a small instruct model.
"""
from __future__ import annotations

from typing import Any

from validation import latest_history_content


def system_prompt() -> str:
    return (
        "You are Cadence Coach, a friendly English conversation partner.\n"
        "Your job is to run short, natural speaking practice sessions.\n"
        "\n"
        "Reply ONLY in this exact format — four labeled lines, nothing else:\n"
        "\n"
        "CoachMessage: <your next message to the learner>\n"
        "LearnerReply: <the sentence the learner should say next, or blank in freedom mode>\n"
        "Cue: <short pronunciation tip>\n"
        "Checkpoint: <short lowercase label>\n"
        "\n"
        "Rules:\n"
        "- CoachMessage: one short question, or two short sentences if you first answer the learner. Under 20 words.\n"
        "- CoachMessage must directly respond to the learner's last message. Never ignore it.\n"
        "- If the learner asks a question, answer it briefly, then ask one short follow-up.\n"
        "- LearnerReply: one short natural first-person sentence the learner can say aloud. Under 16 words. End with punctuation.\n"
        "- In freedom mode, LearnerReply must be blank.\n"
        "- Cue: one short pronunciation note (e.g. 'stress the first syllable of important').\n"
        "- Checkpoint: a few lowercase words labelling what just happened (e.g. 'asking about weekend plans').\n"
        "- Do NOT output JSON, markdown, bullet points, or any extra commentary.\n"
        "- Do NOT give step-by-step lessons or long explanations.\n"
        "- Do NOT repeat or echo what the learner just said.\n"
    )


def _serialize_history(history: list[dict[str, Any]]) -> str:
    if not history:
        return "No previous turns yet."
    lines: list[str] = []
    for i, entry in enumerate(history[-10:], start=1):
        role = str(entry.get("role") or "user").upper()
        content = str(entry.get("content") or "").strip()
        lines.append(f"{i}. {role}: {content}")
    return "\n".join(lines)


def user_prompt(payload: dict[str, Any]) -> str:
    topic = str(payload.get("topic") or "").strip()
    action = str(payload.get("action") or "continue")
    mode = str(payload.get("mode") or "target").strip().lower()
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    latest_coach = latest_history_content(history, "coach")
    latest_user = latest_history_content(history, "user")

    lines = [
        f"Topic: {topic or 'open speaking practice'}",
        f"Action: {action}",
        f"Mode: {mode}",
        "History:",
        _serialize_history(history),
    ]

    if latest_coach:
        lines.append(f"Latest coach line: {latest_coach}")
    if latest_user:
        lines.append(f"Latest learner line: {latest_user}")

    latest_assessment = payload.get("latestAssessment")
    if isinstance(latest_assessment, dict):
        next_step = str(latest_assessment.get("nextStep") or "").strip()
        if next_step:
            lines.extend(["Latest pronunciation note:", next_step])

    lines.extend([
        "",
        "Instruction:",
        "Start the conversation on the topic." if action == "start"
        else "Continue the conversation from the latest exchange.",
        "Your CoachMessage must respond directly to the latest learner line.",
        "If the learner asks a question, answer it briefly, then ask one short follow-up.",
        "If the learner changes the topic angle, follow that change.",
        "Do not ignore specific details like dates, worries, plans, or ideas the learner mentions.",
        "In target mode, give a short natural sentence as LearnerReply.",
        "In freedom mode, leave LearnerReply blank.",
    ])

    return "\n".join(lines)


def revision_prompt(
    payload: dict[str, Any],
    *,
    previous_output: str,
    error_message: str,
) -> str:
    from parsing import clean_model_output  # avoid circular at module level

    mode = str(payload.get("mode") or "target").strip().lower()
    history = payload.get("history") if isinstance(payload.get("history"), list) else []
    latest_user = latest_history_content(history, "user")

    lines = [
        "Your previous reply had a problem. Please fix it.",
        f"Problem: {error_message}",
        f"Mode: {mode}",
        f"Latest learner line: {latest_user or 'none'}",
        f"Previous output: {clean_model_output(previous_output)[:240]}",
        "",
        "Reply ONLY in this exact format — four labeled lines, nothing else:",
        "",
        "CoachMessage: <your next message>",
        "LearnerReply: <sentence for the learner to say, or blank in freedom mode>",
        "Cue: <short pronunciation tip>",
        "Checkpoint: <short lowercase label>",
        "",
        "CoachMessage must clearly respond to the latest learner line.",
        "If the learner asked a direct question, answer it briefly then ask one follow-up.",
        "Do not give a generic line like 'continue your preparations'.",
        "Do not ignore specific details from the learner line.",
        "In freedom mode, LearnerReply must be blank.",
    ]

    return "\n".join(lines)
