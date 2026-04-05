// FILE: src/app/api/reference-audio/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getEngineUrl() {
  return process.env.AI_ENGINE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text")?.trim();
  const instruct = searchParams.get("instruct")?.trim();

  if (!text) {
    return NextResponse.json(
      { error: "Target text is required." },
      { status: 400 },
    );
  }

  try {
    const upstreamUrl = new URL(`${getEngineUrl()}/reference-audio`);
    upstreamUrl.searchParams.set("text", text);
    if (instruct) {
      upstreamUrl.searchParams.set("instruct", instruct);
    }

    const response = await fetch(upstreamUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { detail?: string }
        | null;

      return NextResponse.json(
        {
          error: payload?.detail ?? "Reference pronunciation generation failed.",
        },
        { status: response.status },
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Reference pronunciation is unavailable. If you are using Docker, make sure the ai-engine service is healthy. If you are running locally, start src/ai-engine/main.py with OmniVoice installed.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { text?: string; instruct?: string }
    | null;
  const text = payload?.text?.trim();
  const instruct = payload?.instruct?.trim();

  if (!text) {
    return NextResponse.json(
      { error: "Target text is required." },
      { status: 400 },
    );
  }

  try {
    const formData = new FormData();
    formData.set("text", text);
    if (instruct) {
      formData.set("instruct", instruct);
    }

    const response = await fetch(`${getEngineUrl()}/reference-audio`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as
        | { detail?: string }
        | null;

      return NextResponse.json(
        {
          error: errorPayload?.detail ?? "Reference pronunciation generation failed.",
        },
        { status: response.status },
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Reference pronunciation is unavailable. If you are using Docker, make sure the ai-engine service is healthy. If you are running locally, start src/ai-engine/main.py with OmniVoice installed.",
      },
      { status: 503 },
    );
  }
}
