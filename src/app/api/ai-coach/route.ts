// FILE: src/app/api/ai-coach/route.ts
import { NextResponse } from "next/server";
import { getCoachEngineUrlForRequest } from "@/lib/runtime/request-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
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
          "AI Coach is offline. Make sure the local coach-engine service is healthy, then try again.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const coachEngineUrl = getCoachEngineUrlForRequest(request);
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
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "AI Coach is offline. Make sure the local coach-engine service is healthy, then try again.",
      },
      { status: 503 },
    );
  }
}
