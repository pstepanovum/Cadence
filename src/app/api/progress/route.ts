import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import { getLearnCatalog } from "@/lib/learn-catalog";
import {
  getLocalLearnState,
  updateLocalModuleExamProgress,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { clampScore } from "@/lib/cloud/attempt-input";
import { applyExamToProgress, bootstrapModuleProgress } from "@/lib/cloud/store";

export const runtime = "nodejs";

/** Bootstrap module 1 as unlocked for a new user. */
export async function POST() {
  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (session.mode === "local") {
      const cookieStore = await cookies();
      const localState = await getLocalLearnState();
      await writeLocalLearnState(cookieStore, localState);
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    await bootstrapModuleProgress(session.user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to bootstrap progress." },
      { status: 500 },
    );
  }
}

/** Complete a module's exam and unlock the next module. */
export async function PATCH(request: Request) {
  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as { module_id: number; exam_score: number };
    const { module_id } = body;
    const exam_score = typeof body.exam_score === "number" ? clampScore(body.exam_score) : Number.NaN;

    if (!Number.isFinite(exam_score)) {
      return NextResponse.json({ error: "An exam_score is required." }, { status: 400 });
    }

    const catalog = await getLearnCatalog();

    if (session.mode === "local") {
      const cookieStore = await cookies();
      const localState = await getLocalLearnState();
      const nextState = updateLocalModuleExamProgress(
        localState,
        module_id,
        exam_score,
        catalog.modules.length,
      );
      await writeLocalLearnState(cookieStore, nextState);

      const moduleProgress = nextState.m[String(module_id)];
      return NextResponse.json({
        passed: exam_score >= 70,
        best_exam_score: moduleProgress?.b ?? Math.round(exam_score),
      });
    }

    if (
      !catalog.modules.some((module) => module.id === module_id) ||
      !Number.isFinite(exam_score)
    ) {
      return NextResponse.json(
        { error: "A known module_id and an exam_score are required." },
        { status: 400 },
      );
    }

    const result = await applyExamToProgress(
      session.user.id,
      module_id,
      exam_score,
      catalog.modules.length,
    );

    return NextResponse.json({ passed: result.passed, best_exam_score: result.bestExamScore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update progress." },
      { status: 500 },
    );
  }
}
