import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getLearningStatsForMode } from "@/lib/learn-data";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const stats = await getLearningStatsForMode(session.mode, session.user.id);
    return NextResponse.json(stats);
  } catch (err) {
    // The message can carry Firestore paths or credential details; log it only.
    console.error("/api/stats failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch stats." }, { status: 500 });
  }
}
