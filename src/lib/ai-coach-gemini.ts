import "server-only";

import type {
  AiCoachGeneratedTurn,
  AiCoachHistoryEntry,
  AiCoachReplyMode,
  AiCoachRequestPayload,
} from "@/lib/ai-coach";

const GEMINI_GENERATE_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export function isGeminiCoachConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function latestUserContent(history: AiCoachHistoryEntry[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.role !== "user") continue;
    const content = String(entry.content ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (content) return content;
  }
  return "";
}

function serializeHistory(history: AiCoachHistoryEntry[]): string {
  const lines: string[] = [];
  for (const entry of history.slice(-8)) {
    const role = entry.role === "coach" ? "Coach" : "User";
    const content = String(entry.content ?? "").trim();
    if (content) lines.push(`${role}: ${content}`);
  }
  return lines.length ? lines.join("\n") : "";
}

function buildUserPromptText(payload: AiCoachRequestPayload): string {
  const topic = payload.topic.trim() || "open discussion";
  const { action, history } = payload;

  if (action === "start") {
    return `Topic: ${topic}\nAsk one specific question about this topic (not a generic hello only).`;
  }

  const serialized = serializeHistory(history);
  const latestUser = latestUserContent(history);
  const lines = [`Topic: ${topic}`, ""];
  if (serialized) {
    lines.push(serialized, "");
  }
  if (latestUser) {
    lines.push(`They said: ${latestUser}`);
  }
  lines.push("Answer them and move the topic forward in one coach line.");
  return lines.join("\n");
}

function systemInstructionForMode(mode: AiCoachReplyMode | undefined): string {
  const m = mode ?? "target";
  if (m === "freedom") {
    return (
      "You are a friendly coach in a spoken chat. Stay on the topic you are given.\n" +
      "Do not talk about pronunciation, accents, or English practice.\n" +
      "Respond with natural, engaging questions or comments. Be concise.\n" +
      "Output JSON only (no markdown): {\"coachMessage\": string}. " +
      "learnerReply must be an empty string \"\" in freedom mode."
    );
  }
  return (
    "You are a friendly coach in a spoken chat. Stay on the topic you are given.\n" +
    "Do not talk about pronunciation, accents, or English practice.\n" +
    "Respond with natural, engaging questions or comments. Be concise.\n" +
    "Output JSON only (no markdown): {\"coachMessage\": string, \"learnerReply\": string}. " +
    "learnerReply is a short first-person sentence the learner could say next (for pronunciation practice), ending with . ? or !"
  );
}

function responseSchemaForMode(mode: AiCoachReplyMode | undefined): object {
  const m = mode ?? "target";
  if (m === "freedom") {
    return {
      type: "OBJECT",
      properties: {
        coachMessage: { type: "STRING" },
        learnerReply: { type: "STRING" },
      },
      required: ["coachMessage", "learnerReply"],
    };
  }
  return {
    type: "OBJECT",
    properties: {
      coachMessage: { type: "STRING" },
      learnerReply: { type: "STRING" },
    },
    required: ["coachMessage", "learnerReply"],
  };
}

function normalizeTurn(
  raw: { coachMessage?: unknown; learnerReply?: unknown },
  mode: AiCoachReplyMode | undefined,
): AiCoachGeneratedTurn {
  const coachMessage = String(raw.coachMessage ?? "")
    .replace(/\s+/g, " ")
    .trim();
  let learnerReply = String(raw.learnerReply ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!coachMessage) {
    throw new Error("Gemini returned an empty coachMessage.");
  }

  if (mode === "freedom") {
    learnerReply = "";
  } else if (learnerReply && !/[.!?]$/.test(learnerReply)) {
    learnerReply = `${learnerReply}.`;
  }

  if (mode === "target" && !learnerReply) {
    throw new Error("Gemini returned an empty learnerReply in target mode.");
  }

  return { coachMessage, learnerReply };
}

export async function generateCoachTurnWithGemini(
  payload: AiCoachRequestPayload,
): Promise<AiCoachGeneratedTurn> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model =
    process.env.GEMINI_COACH_MODEL?.trim() || "gemini-2.5-flash";
  const mode = payload.mode ?? "target";
  const url = `${GEMINI_GENERATE_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemInstructionForMode(mode) }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildUserPromptText(payload) }],
      },
    ],
    generationConfig: {
      temperature: Number(process.env.GEMINI_COACH_TEMPERATURE ?? "0.85"),
      topP: 0.95,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: responseSchemaForMode(mode),
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    const errText =
      data && typeof data === "object" && "error" in data
        ? JSON.stringify((data as { error?: unknown }).error)
        : response.statusText;
    throw new Error(`Gemini request failed (${response.status}): ${errText}`);
  }

  const candidates = data?.candidates as
    | Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>
    | undefined;

  const text = candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text?.trim()) {
    const block = data?.promptFeedback as { blockReason?: string } | undefined;
    throw new Error(
      block?.blockReason
        ? `Gemini blocked the prompt: ${block.blockReason}`
        : "Gemini returned no text.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gemini JSON was not an object.");
  }

  return normalizeTurn(parsed as Record<string, unknown>, mode);
}
