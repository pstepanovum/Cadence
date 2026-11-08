import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getLearnCatalog } from "@/lib/learn-catalog";
import { getLocalLearnState, getLocalLessonSummary } from "@/lib/local-learn";
import { summarizeLessonSessions } from "@/lib/cloud/progress-logic";
import { listEndedLessonSessions } from "@/lib/cloud/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const { moduleId } = await params;
  const moduleIdNum = parseInt(moduleId, 10);

  if (isNaN(moduleIdNum)) {
    return NextResponse.json({ error: "Invalid module ID." }, { status: 400 });
  }

  try {
    const session = await getAppSession();
    const catalog = await getLearnCatalog();
    const normalizedLessons = (
      catalog.lessonsByModuleId.get(moduleIdNum) ?? []
    ).map((lesson) => ({
      ...lesson,
    }));

    if (!session.mode || !session.user) {
      return NextResponse.json(normalizedLessons);
    }

    if (session.mode === "local") {
      const localState = await getLocalLearnState();
      return NextResponse.json(
        normalizedLessons.map((lesson) => ({
          ...lesson,
          session_summary: getLocalLessonSummary(localState, lesson.slug),
        })),
      );
    }

    const summaries = summarizeLessonSessions(
      await listEndedLessonSessions(
        session.user.id,
        normalizedLessons.map((lesson) => lesson.id),
      ),
    );

    // The cards link to the lesson, not to one run of it.
    const withSummary = normalizedLessons.map((lesson) => {
      const summary = summaries.get(lesson.id);
      return {
        ...lesson,
        session_summary: summary ? { ...summary, session_id: null } : null,
      };
    });

    return NextResponse.json(withSummary);
  } catch (err) {
    // The message can carry Firestore paths or credential details; log it only.
    console.error("/api/modules/[moduleId]/lessons failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch lessons." }, { status: 500 });
  }
}
