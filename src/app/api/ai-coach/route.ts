// FILE: src/app/api/ai-coach/route.ts
import { NextResponse } from "next/server";
import type { AiCoachRequestPayload } from "@/lib/ai-coach";
import { getCoachEngineUrlForRequest } from "@/lib/runtime/request-runtime";
import { authorizeAi, runCharged } from "@/lib/server/ai-route";
import { coachFor } from "@/lib/server/engines";
import { isCefrLevel } from "@/lib/platform/content-model";
import { isHostedCloud } from "@/lib/server/env";
import { readJsonObject } from "@/lib/server/http";
import { contentLibrary } from "@/lib/server/packs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (isHostedCloud()) {
    return NextResponse.json({ ready: true, message: "The cloud coach is available with Cadence Plus." });
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
      // A status answer, like GET /api/assess: clients read `ready`.
      { status: 200 },
    );
  }
}

/**
 * One coach turn. Own Cadence: the local coach engine (Qwen), ungated. Hosted
 * cloud: Plus, App Check, one coach turn off the daily quota, Gemini behind a
 * fixed system prompt with the learner's words passed as data
 * (src/lib/server/engines/prompts.ts).
 *
 * Body: {action: "start"|"continue", topic?, scenarioId?, mode?, level?, history: [{role, content}], summary?}
 * Answer: {turn: {coachMessage, learnerReply}, summary, provider}
 */
export async function POST(request: Request) {
  const access = await authorizeAi(request, "coach");
  if (!access.ok) return access.response;

  // Capped while reading: 40 turns of 2,000 characters fit well inside it.
  const raw = await readJsonObject(request, 256 * 1024).catch(() => null);
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid AI Coach request payload." }, { status: 400 });
  }
  const library = await contentLibrary();
  const scenario = typeof raw.scenarioId === "string" ? (library.scenarios.get(raw.scenarioId) ?? null) : null;
  const topic = typeof raw.topic === "string" ? raw.topic.slice(0, 200) : "";
  if (!scenario && !topic.trim()) {
    return NextResponse.json({ error: "A topic or a scenario is required." }, { status: 400 });
  }
  const action = raw.action === "continue" ? "continue" : "start";
  const historyRaw = Array.isArray(raw.history) ? raw.history.slice(-40) : [];
  const history = historyRaw
    .map((entry) => entry as { role?: unknown; content?: unknown })
    .filter((entry) => typeof entry.content === "string")
    .map((entry) => ({ role: entry.role === "coach" ? ("coach" as const) : ("learner" as const), text: String(entry.content).slice(0, 2000) }));
  const level = isCefrLevel(raw.level) ? raw.level : null;
  const legacy: AiCoachRequestPayload = {
    action,
    topic: scenario?.title ?? topic,
    mode: raw.mode === "freedom" ? "freedom" : "target",
    history: historyRaw as AiCoachRequestPayload["history"],
  };

  const result = await runCharged(access, "coach", {}, () =>
    coachFor(request).turn({
      scenario,
      topic,
      history,
      summary: typeof raw.summary === "string" ? raw.summary : undefined,
      start: action === "start",
      level,
      legacy: { ...(legacy as unknown as Record<string, unknown>), ...(level ? { level } : {}) },
    }),
  );
  if (!result.ok) return result.response;
  const turn = result.value;
  return NextResponse.json({
    turn: { coachMessage: turn.coachMessage, learnerReply: legacy.mode === "freedom" ? "" : turn.learnerReply },
    summary: turn.summary,
    provider: access.mode === "cloud" ? "cloud" : "local-coach",
  });
}
