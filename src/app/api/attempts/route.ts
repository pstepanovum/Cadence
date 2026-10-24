import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import {
  getLocalLearnState,
  recordLocalAttempt,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { recordLessonAttempt } from "@/lib/cloud/store";

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

    if (
      typeof body.lesson_id !== "string" ||
      typeof body.lesson_word_id !== "string" ||
      typeof body.word !== "string" ||
      !Number.isFinite(body.score)
    ) {
      return NextResponse.json(
        { error: "lesson_id, lesson_word_id, word and score are required." },
        { status: 400 },
      );
    }

    const attemptNumber = Number.isFinite(body.attempt_number) ? body.attempt_number : 1;
    const id = await recordLessonAttempt(session.user.id, {
      lessonId: body.lesson_id,
      lessonWordId: body.lesson_word_id,
      word: body.word,
      score: body.score,
      ipaTarget: typeof body.ipa_target === "string" ? body.ipa_target : null,
      ipaTranscript: typeof body.ipa_transcript === "string" ? body.ipa_transcript : null,
      phonemeDetail: body.phoneme_detail ?? null,
      attemptNumber,
    });

    return NextResponse.json(
      {
        id,
        lesson_id: body.lesson_id,
        lesson_word_id: body.lesson_word_id,
        word: body.word,
        score: body.score,
        attempt_number: attemptNumber,
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
