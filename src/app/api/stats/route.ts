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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch stats." },
      { status: 500 },
    );
  }
}
