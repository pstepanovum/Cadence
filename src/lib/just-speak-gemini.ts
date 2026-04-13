import "server-only";

const GEMINI_GENERATE_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type JustSpeakFeedback = {
  overallSummary: string;
  whatWentWell: string[];
  whatToImprove: string[];
  practiceDrill: string;
  coachScript: string;
};

function buildPrompt(input: {
  whisperTranscript: string;
  overallScore: number | null;
  engineTranscript?: string | null;
  phonemeDetail?: unknown;
}): string {
  const heard = input.whisperTranscript.trim();
  const score =
    typeof input.overallScore === "number" ? `${Math.round(input.overallScore)}` : "unknown";
  const engineTranscript = String(input.engineTranscript ?? "").trim();

  return [
    "You are a pronunciation coach. The learner spoke aloud freely (no target phrase shown).",
    "Your job: based on what was heard, give actionable, specific pronunciation feedback they can apply immediately.",
    "",
    `Whisper transcript (what was heard): ${heard || "(empty)"}`,
    `Pronunciation score (0-100): ${score}`,
    engineTranscript ? `Engine transcript (phonetic transcript): ${engineTranscript}` : null,
    "",
    "Constraints:",
    "- Do NOT mention model names (Gemini/Whisper) or any technical pipeline.",
    "- Keep it encouraging, concrete, and short.",
    "- Focus on 2-4 highest-impact improvements.",
    "- If the transcript suggests unclear words, call out the specific words/phrases that likely caused it.",
    "- Provide a short drill (one thing to repeat 3-5 times).",
    "- coachScript must be 1-2 spoken sentences, plain English, no emojis.",
    "",
    "Return JSON only with this shape:",
    `{"overallSummary": string, "whatWentWell": string[], "whatToImprove": string[], "practiceDrill": string, "coachScript": string}`,
    "",
    "Extra context (may be partial):",
    input.phonemeDetail ? JSON.stringify(input.phonemeDetail).slice(0, 6000) : "(none)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isJustSpeakGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function generateJustSpeakFeedbackWithGemini(input: {
  whisperTranscript: string;
  overallScore: number | null;
  engineTranscript?: string | null;
  phonemeDetail?: unknown;
}): Promise<JustSpeakFeedback> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model =
    process.env.GEMINI_JUST_SPEAK_MODEL?.trim() || "gemini-2.5-flash";

  const url = `${GEMINI_GENERATE_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const schema = {
    type: "OBJECT",
    properties: {
      overallSummary: { type: "STRING" },
      whatWentWell: { type: "ARRAY", items: { type: "STRING" } },
      whatToImprove: { type: "ARRAY", items: { type: "STRING" } },
      practiceDrill: { type: "STRING" },
      coachScript: { type: "STRING" },
    },
    required: ["overallSummary", "whatWentWell", "whatToImprove", "practiceDrill", "coachScript"],
  };

  const body = {
    systemInstruction: {
      parts: [
        {
          text:
            "You are a supportive pronunciation coach. Output JSON only. No markdown.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(input) }],
      },
    ],
    generationConfig: {
      temperature: Number(process.env.GEMINI_JUST_SPEAK_TEMPERATURE ?? "0.6"),
      topP: 0.9,
      maxOutputTokens: 700,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

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
      }>
    | undefined;

  const text = candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text?.trim()) {
    throw new Error("Gemini returned no text.");
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

  const obj = parsed as Partial<JustSpeakFeedback>;
  const overallSummary = String(obj.overallSummary ?? "").trim();
  const practiceDrill = String(obj.practiceDrill ?? "").trim();
  const coachScript = String(obj.coachScript ?? "").trim();
  const whatWentWell = Array.isArray(obj.whatWentWell)
    ? obj.whatWentWell.map((v) => String(v).trim()).filter(Boolean).slice(0, 5)
    : [];
  const whatToImprove = Array.isArray(obj.whatToImprove)
    ? obj.whatToImprove.map((v) => String(v).trim()).filter(Boolean).slice(0, 6)
    : [];

  if (!overallSummary || !practiceDrill || !coachScript) {
    throw new Error("Gemini returned an incomplete feedback payload.");
  }

  return {
    overallSummary,
    whatWentWell,
    whatToImprove,
    practiceDrill,
    coachScript,
  };
}

