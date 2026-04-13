// FILE: src/app/api/ai-coach/route.ts
import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import {
  generateCoachTurnWithGemini,
  isGeminiCoachConfigured,
} from "@/lib/ai-coach-gemini";
import type { AiCoachRequestPayload } from "@/lib/ai-coach";
import { getCoachEngineUrlForRequest } from "@/lib/runtime/request-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getAppSession();

  if (session.mode === "cloud" && isGeminiCoachConfigured()) {
    return NextResponse.json({
      ready: true,
      message: "AI Coach (Gemini) is ready.",
    });
  }

  const coachEngineUrl = getCoachEngineUrlForRequest(request);

  try {
    const response = await fetch(`${coachEngineUrl}/coach-status`, {
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
          "AI Coach is offline. For cloud, set GEMINI_API_KEY; for local, start the coach-engine service.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getAppSession();
  const raw = await request.json().catch(() => null);

  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { error: "Invalid AI Coach request payload." },
      { status: 400 },
    );
  }

  const body = raw as Partial<AiCoachRequestPayload>;
  if (!body.topic || typeof body.topic !== "string") {
    return NextResponse.json(
      { error: "A topic is required." },
      { status: 400 },
    );
  }
  const action = body.action === "continue" ? "continue" : "start";
  const payload: AiCoachRequestPayload = {
    action,
    topic: body.topic,
    mode: body.mode === "freedom" ? "freedom" : "target",
    history: Array.isArray(body.history) ? body.history : [],
  };

  if (session.mode === "cloud") {
    if (!session.user) {
      return NextResponse.json(
        { error: "Sign in to use AI Coach in cloud mode." },
        { status: 401 },
      );
    }

    if (isGeminiCoachConfigured()) {
      try {
        const turn = await generateCoachTurnWithGemini(payload);
        return NextResponse.json(
          {
            turn,
            provider: "gemini",
          },
          { status: 200 },
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Gemini generation failed.";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }
  }

  const coachEngineUrl = getCoachEngineUrlForRequest(request);

  try {
    const response = await fetch(`${coachEngineUrl}/coach-turn`, {
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
        provider: "local-coach",
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "AI Coach is offline. Start the coach-engine service or use cloud with GEMINI_API_KEY.",
      },
      { status: 503 },
    );
  }
}
