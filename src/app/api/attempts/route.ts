import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import {
  getLocalLearnState,
  recordLocalAttempt,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      writeLocalLearnState(cookieStore, nextState);

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

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lesson_attempts")
      .insert({
        user_id: session.user.id,
        lesson_id: body.lesson_id,
        lesson_word_id: body.lesson_word_id,
        word: body.word,
        score: body.score,
        ipa_target: body.ipa_target,
        ipa_transcript: body.ipa_transcript ?? null,
        phoneme_detail: body.phoneme_detail ?? null,
        attempt_number: body.attempt_number ?? 1,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save attempt." },
      { status: 500 },
    );
  }
}
