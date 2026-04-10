// FILE: src/app/api/conversation-progress/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import {
  CONVERSATION_PROGRESS_COOKIE,
  getConversationModule,
  parseConversationProgress,
  serializeConversationProgress,
} from "@/lib/conversation";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      moduleSlug?: string;
      score?: number;
      passed?: boolean;
    };

    const moduleSlug = body.moduleSlug?.trim();
    const score = typeof body.score === "number" ? Math.round(body.score) : null;
    const passed = body.passed === true;

    if (!moduleSlug || score === null) {
      return NextResponse.json(
        { error: "moduleSlug and score are required." },
        { status: 400 },
      );
    }

    const conversationModule = getConversationModule(moduleSlug);
    if (!conversationModule) {
      return NextResponse.json({ error: "Unknown module." }, { status: 404 });
    }

    const cookieStore = await cookies();
    const progress = parseConversationProgress(
      cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
    );

    const previous = progress[moduleSlug];
    progress[moduleSlug] = {
      bestScore: Math.max(score, previous?.bestScore ?? 0),
      lastScore: score,
      passed: previous?.passed === true || passed,
      completedAt:
        previous?.passed === true || passed
          ? previous?.completedAt ?? new Date().toISOString()
          : null,
      updatedAt: new Date().toISOString(),
    };

    cookieStore.set(
      CONVERSATION_PROGRESS_COOKIE,
      serializeConversationProgress(progress),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      },
    );

    return NextResponse.json({
      ok: true,
      moduleSlug,
      progress: progress[moduleSlug],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update conversation progress.",
      },
      { status: 500 },
    );
  }
}
