import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import {
  getLocalLearnState,
  recordLocalAttempt,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { parseAttemptInput } from "@/lib/cloud/attempt-input";
import { recordLessonAttempt } from "@/lib/cloud/store";
import { getLessonByIdFromCatalog } from "@/lib/learn-catalog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as {
      lesson_id: string;
      lesson_word_id: string;
      word: string;
      score: number;
      ipa_target: string;
      ipa_transcript: string;
      phoneme_detail: Record<string, unknown>;
      attempt_number: number;
    };

    if (session.mode === "local") {
      const cookieStore = await cookies();
      const localState = await getLocalLearnState();
      const nextState = recordLocalAttempt(localState, body.score);
      await writeLocalLearnState(cookieStore, nextState);

      return NextResponse.json(
        {
          id: randomUUID(),
          lesson_id: body.lesson_id,
          lesson_word_id: body.lesson_word_id,
          word: body.word,
          score: body.score,
          attempt_number: body.attempt_number ?? 1,
        },
        { status: 201 },
      );
    }

    const parsed = parseAttemptInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const attempt = parsed.value;
    const lesson = await getLessonByIdFromCatalog(attempt.lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Unknown lesson." }, { status: 404 });
    }

    const id = await recordLessonAttempt(session.user.id, attempt);

    return NextResponse.json(
      {
        id,
        lesson_id: attempt.lessonId,
        lesson_word_id: attempt.lessonWordId,
        word: attempt.word,
        score: attempt.score,
        attempt_number: attempt.attemptNumber,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save attempt." },
      { status: 500 },
    );
  }
}
