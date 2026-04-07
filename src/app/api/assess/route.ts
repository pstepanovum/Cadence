// FILE: src/app/api/assess/route.ts
import { NextResponse } from "next/server";
import { getAiEngineUrlForRequest } from "@/lib/runtime/request-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const engineUrl = getAiEngineUrlForRequest(request);

  try {
    const response = await fetch(`${engineUrl}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("FastAPI health check failed.");
    }

    const payload = (await response.json()) as {
      status?: string;
      modelReady?: boolean;
      transcriberReady?: boolean;
      transcriberLoadError?: string | null;
      loadError?: string | null;
      hfTokenConfigured?: boolean;
      diagnostics?: {
        pythonExecutable?: string;
        phonemizerImportable?: boolean;
        phonemizerVersion?: string | null;
        espeakPath?: string | null;
        espeakNgPath?: string | null;
      };
    };

    const reachable = response.ok;
    const ready = payload.status === "ok" && payload.modelReady === true;
    const warming = reachable && !ready;

    return NextResponse.json(
      {
        ready,
        warming,
        reachable,
        transcriberReady: payload.transcriberReady ?? false,
        transcriberLoadError: payload.transcriberLoadError ?? null,
        hfTokenConfigured: payload.hfTokenConfigured ?? false,
        loadError: payload.loadError ?? null,
        diagnostics: payload.diagnostics ?? null,
        needsRestartHint:
          typeof payload.loadError === "string" &&
          payload.loadError.toLowerCase().includes("phonemizer"),
        message: ready
          ? "FastAPI engine is online and model inference is ready."
          : payload.loadError
            ? `FastAPI is reachable, but model loading failed: ${payload.loadError}`
            : "FastAPI is reachable and the model is still warming up.",
      },
      { status: ready ? 200 : 202 },
    );
  } catch {
    return NextResponse.json(
      {
        ready: false,
        warming: false,
        reachable: false,
        transcriberReady: false,
        transcriberLoadError: "FastAPI transcription engine is not reachable.",
        hfTokenConfigured: false,
        diagnostics: null,
        needsRestartHint: false,
        loadError: "FastAPI engine is not reachable.",
        message:
          "Pronunciation scoring is offline. Make sure the local ai-engine service is healthy, then try again.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const engineUrl = getAiEngineUrlForRequest(request);
  const formData = await request.formData();
  const audio = formData.get("audio");
  const text = formData.get("text");

  if (!(audio instanceof File)) {
    return NextResponse.json(
      { error: "An audio file is required." },
      { status: 400 },
    );
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "Target text is required." },
      { status: 400 },
    );
  }

  const upstreamFormData = new FormData();
  upstreamFormData.set("audio", audio, audio.name || "attempt.wav");
  upstreamFormData.set("text", text);

  try {
    const response = await fetch(`${engineUrl}/assess`, {
      method: "POST",
      body: upstreamFormData,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "detail" in payload
          ? String(payload.detail)
          : "FastAPI assessment failed.";

      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
        {
          error:
          "Pronunciation scoring is offline. Make sure the local ai-engine service is healthy, then try again.",
        },
      { status: 503 },
    );
  }
}
