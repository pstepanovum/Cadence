// FILE: src/app/api/transcribe/route.ts
import { NextResponse } from "next/server";
import { getAiEngineUrlForRequest } from "@/lib/runtime/request-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const engineUrl = getAiEngineUrlForRequest(request);
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
    const response = await fetch(`${engineUrl}/transcribe`, {
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
          "Transcription is offline. Make sure the local ai-engine service is healthy, then try again.",
        },
      { status: 503 },
    );
  }
}
