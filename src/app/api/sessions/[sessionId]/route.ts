import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import {
  finishLocalSession,
  getLocalLearnState,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { finishLessonSession } from "@/lib/cloud/store";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as {
      word_count: number;
      avg_score: number;
      passed: boolean;
    };

    if (session.mode === "local") {
      const cookieStore = await cookies();
      const localState = await getLocalLearnState();
      const nextState = finishLocalSession(localState, sessionId, {
        avgScore: body.avg_score,
        passed: body.passed,
      });
      await writeLocalLearnState(cookieStore, nextState);

      return NextResponse.json({
        id: sessionId,
        word_count: body.word_count,
        avg_score: Math.round(body.avg_score),
        passed: body.passed,
      });
    }

    if (
      !Number.isFinite(body.word_count) ||
      !Number.isFinite(body.avg_score) ||
      typeof body.passed !== "boolean"
    ) {
      return NextResponse.json(
        { error: "word_count, avg_score and passed are required." },
        { status: 400 },
      );
    }

    const finished = await finishLessonSession(session.user.id, sessionId, {
      wordCount: Math.round(body.word_count),
      avgScore: Math.round(body.avg_score),
      passed: body.passed,
    });

    if (!finished) {
      return NextResponse.json({ error: "Unknown session." }, { status: 404 });
    }

    return NextResponse.json(finished);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to end session." },
      { status: 500 },
    );
  }
}
