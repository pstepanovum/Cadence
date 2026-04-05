// FILE: src/app/api/health/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "web",
  });
}

