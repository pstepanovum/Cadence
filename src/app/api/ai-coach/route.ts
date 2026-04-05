// FILE: src/app/api/ai-coach/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getCoachEngineUrl() {
  return (
    process.env.AI_COACH_ENGINE_URL?.replace(/\/$/, "") ??
    process.env.AI_ENGINE_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8001"
  );
}

export async function GET() {
  try {
    const response = await fetch(`${getCoachEngineUrl()}/coach-status`, {
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          ready?: boolean;
          message?: string;
        }
      | null;

    if (!response.ok) {
      return NextResponse.json(
        {
          ready: false,
          message: payload?.message ?? "AI Coach is unavailable right now.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json(
      {
        ready: payload?.ready === true,
        message: payload?.message ?? "AI Coach is ready.",
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ready: false,
        message:
          "AI Coach is offline. If you are using Docker, make sure the coach-engine service is healthy. If you are running locally, start src/coach-engine/main.py after installing the coach dependencies.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      {
        error: "Invalid AI Coach request payload.",
      },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${getCoachEngineUrl()}/coach-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        result && typeof result === "object" && "detail" in result
          ? String(result.detail)
          : "AI Coach generation failed.";

      return NextResponse.json(
        {
          error: detail,
        },
        { status: response.status },
      );
    }

    return NextResponse.json(
      {
        turn:
          result && typeof result === "object" && "turn" in result
            ? result.turn
            : null,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "AI Coach is offline. If you are using Docker, make sure the coach-engine service is healthy. If you are running locally, start src/coach-engine/main.py after installing the coach dependencies.",
      },
      { status: 503 },
    );
  }
}
