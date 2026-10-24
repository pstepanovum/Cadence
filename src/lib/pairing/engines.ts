// FILE: src/lib/pairing/engines.ts
//
// Whether the pronunciation engine is up and its model loaded, as reported in
// the `enginesReady` field of every server-info payload.
import { getAiEngineUrlForRequest } from "@/lib/runtime/request-runtime";

export async function areEnginesReady(request: Request): Promise<boolean> {
  try {
    const response = await fetch(`${getAiEngineUrlForRequest(request)}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string; modelReady?: boolean };
    return payload.status === "ok" && payload.modelReady === true;
  } catch {
    return false;
  }
}
