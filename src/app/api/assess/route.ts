// FILE: src/app/api/assess/route.ts
import { NextResponse } from "next/server";
import { getAiEngineUrlForRequest } from "@/lib/runtime/request-runtime";
import { authorizeAi, readAudio, readCappedForm, runCharged } from "@/lib/server/ai-route";
import { scorerFor } from "@/lib/server/engines";
import { isHostedCloud } from "@/lib/server/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // The hosted scorer scales to zero; probing it here would wake it for
  // nothing. Cold starts are covered by its startup probe.
  if (isHostedCloud()) {
    return NextResponse.json({ ready: true, warming: false, reachable: true, transcriberReady: true, cloud: true, message: "Cloud scoring is available with Cadence Plus." });
  }
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
      // A status answer, not a failure: clients read `ready` and poll every
      // few seconds, and a 503 would log an error in the browser each time.
      { status: 200 },
    );
  }
}

/**
 * Scores a recording against its target text. On an own Cadence it runs on the
 * local engine, ungated; on the hosted cloud it needs Plus and is charged
 * against the daily audio quota (src/lib/server/ai-gate.ts).
 */
export async function POST(request: Request) {
  const access = await authorizeAi(request, "score");
  if (!access.ok) return access.response;

  const form = await readCappedForm(request);
  if (form instanceof Response) return form;
  const audio = await readAudio(form);
  if (audio instanceof Response) return audio;
  const text = form.get("text");
  if (typeof text !== "string" || !text.trim() || text.length > 500) {
    return NextResponse.json({ error: "Target text is required." }, { status: 400 });
  }

  const result = await runCharged(access, "score", { audioSeconds: audio.seconds }, () => scorerFor(request).score(audio, text.trim()));
  return result.ok ? NextResponse.json(result.value) : result.response;
}
