// FILE: src/app/api/health/route.ts
//
// GET: liveness. `ok` is always true once the server answers, so a Cloud Run
// or Docker probe never waits on anything else. On your own Cadence (desktop
// or server) it also reports whether the two local engines are ready, which
// the desktop smoke test and the setup screen read. The hosted cloud skips
// that: its scorer scales to zero and a health check must not wake it.
import { NextResponse } from "next/server";
import { getAiEngineUrlForRequest, getCoachEngineUrlForRequest } from "@/lib/runtime/request-runtime";
import { isHostedCloud } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_TIMEOUT_MS = 1500;

interface EngineHealth {
  ready: boolean;
  reachable: boolean;
}

async function engineHealth(url: string, isReady: (body: Record<string, unknown>) => boolean): Promise<EngineHealth> {
  try {
    const response = await fetch(`${url}/health`, { cache: "no-store", signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS) });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { reachable: true, ready: response.ok && isReady(body) };
  } catch {
    return { reachable: false, ready: false };
  }
}

export async function GET(request: Request) {
  if (isHostedCloud()) return NextResponse.json({ ok: true, service: "web" });
  const [ai, coach] = await Promise.all([
    engineHealth(getAiEngineUrlForRequest(request), (body) => body.status === "ok"),
    engineHealth(getCoachEngineUrlForRequest(request), (body) => body.ready === true),
  ]);
  return NextResponse.json({ ok: true, service: "web", engines: { ai, coach } });
}
