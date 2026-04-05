// FILE: src/app/api/transcribe/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getEngineUrl() {
  return process.env.AI_ENGINE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json(
      { error: "An audio file is required." },
      { status: 400 },
    );
  }

  const upstreamFormData = new FormData();
  upstreamFormData.set("audio", audio, audio.name || "attempt.wav");

  try {
    const response = await fetch(`${getEngineUrl()}/transcribe`, {
      method: "POST",
      body: upstreamFormData,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "detail" in payload
          ? String(payload.detail)
          : "FastAPI transcription failed.";

      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        error:
          "Transcription is offline. If you are using Docker, make sure the ai-engine service is healthy. If you are running locally, start src/ai-engine/main.py first.",
      },
      { status: 503 },
    );
  }
}
