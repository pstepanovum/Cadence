import "server-only";

import type { AppMode } from "@/lib/app-mode";
import type {
  Lesson,
  LessonSessionSummary,
  LessonWithSummary,
  ModuleWithProgress,
  Stats,
} from "@/lib/learn";
import {
  getLearnCatalog,
  getLessonFromCatalog,
  getModuleFromCatalog,
} from "@/lib/learn-catalog";
import {
  getLocalLearnState,
  getLocalLessonSummary,
  getLocalModuleProgress,
  getLocalStats,
} from "@/lib/local-learn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getModulesWithProgressForMode(
  mode: AppMode,
  userId: string,
): Promise<ModuleWithProgress[]> {
  const catalog = await getLearnCatalog();

  if (mode === "local") {
    const localState = await getLocalLearnState();
    return catalog.modules.map((module) => ({
      ...module,
      progress: getLocalModuleProgress(localState, module.id),
    }));
  }

  const supabase = await createSupabaseServerClient();
  const { data: progress } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", userId);

  const progressMap = new Map((progress ?? []).map((entry) => [entry.module_id, entry]));

  return catalog.modules.map((module) => ({
    ...module,
    progress:
      (progressMap.get(module.id) as ModuleWithProgress["progress"]) ?? null,
  }));
}

export async function getModuleLessonDataForMode(
  mode: AppMode,
  userId: string,
  moduleSlug: string,
) {
  const catalog = await getLearnCatalog();
  const moduleEntry = await getModuleFromCatalog(moduleSlug);

  if (!moduleEntry) {
    return null;
  }

  const lessons = catalog.lessonsByModuleId.get(moduleEntry.id) ?? [];

  if (mode === "local") {
    const localState = await getLocalLearnState();
    const moduleWithProgress: ModuleWithProgress = {
      ...moduleEntry,
      progress: getLocalModuleProgress(localState, moduleEntry.id),
    };
    const lessonSummaries = new Map<string, LessonSessionSummary | null>(
      lessons.map((lesson) => [lesson.id, getLocalLessonSummary(localState, lesson.slug)]),
    );

    return {
      module: moduleWithProgress,
      lessons: lessons.map((lesson) => ({
        ...lesson,
        session_summary: lessonSummaries.get(lesson.id) ?? null,
      })),
    };
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: progress }, { data: sessions }] = await Promise.all([
    supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("module_id", moduleEntry.id)
      .single(),
    supabase
      .from("lesson_sessions")
      .select("lesson_id, avg_score, passed, id")
      .eq("user_id", userId)
      .in("lesson_id", lessons.map((lesson) => lesson.id))
      .not("ended_at", "is", null),
  ]);

  const sessionMap = buildLessonSummaryMap(sessions ?? []);

  return {
    module: {
      ...moduleEntry,
      progress: progress ?? null,
    } satisfies ModuleWithProgress,
    lessons: lessons.map((lesson) => ({
      ...lesson,
      session_summary: sessionMap.get(lesson.id) ?? null,
    })),
  };
}

export async function getLessonDataForMode(
  mode: AppMode,
  userId: string,
  moduleSlug: string,
  lessonSlug: string,
) {
  const moduleLessonData = await getModuleLessonDataForMode(mode, userId, moduleSlug);

  if (!moduleLessonData) {
    return null;
  }

  const lesson = await getLessonFromCatalog(moduleLessonData.module.id, lessonSlug);

  if (!lesson) {
    return null;
  }

  const nextLesson =
    moduleLessonData.lessons.find(
      (candidate) => candidate.sort_order === lesson.sort_order + 1,
    ) ?? null;

  const catalog = await getLearnCatalog();
  const nextModule =
    catalog.modules.find(
      (candidate) => candidate.sort_order === moduleLessonData.module.sort_order + 1,
    ) ?? null;

  return {
    module: moduleLessonData.module,
    lesson,
    nextLessonSlug: nextLesson?.slug ?? null,
    nextModuleSlug: nextModule?.slug ?? null,
  };
}

export async function getModuleProgressStatsForMode(
  mode: AppMode,
  userId: string,
) {
  const modules = await getModulesWithProgressForMode(mode, userId);
  const completedModules = modules.filter(
    (module) => module.progress?.is_completed,
  ).length;

  return {
    modules,
    totalModules: modules.length,
    completedModules,
  };
}

export async function getLearningStatsForMode(
  mode: AppMode,
  userId: string,
): Promise<Stats> {
  const { completedModules } = await getModuleProgressStatsForMode(mode, userId);

  if (mode === "local") {
    const localState = await getLocalLearnState();
    return getLocalStats(localState, completedModules);
  }

  const supabase = await createSupabaseServerClient();

  const [attemptsResult, sessionsResult] = await Promise.all([
    supabase.from("lesson_attempts").select("score").eq("user_id", userId),
    supabase
      .from("lesson_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(60),
  ]);

  const attempts = attemptsResult.data ?? [];
  const totalAttempts = attempts.length;
  const averageScore =
    totalAttempts > 0
      ? Math.round(
          attempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
            totalAttempts,
        )
      : 0;

  const sessionDays = new Set(
    (sessionsResult.data ?? []).map((session) =>
      new Date(session.started_at).toISOString().slice(0, 10),
    ),
  );

  let currentStreakDays = 0;
  const today = new Date();

  for (let offset = 0; offset < 60; offset += 1) {
    const probe = new Date(today);
    probe.setDate(today.getDate() - offset);

    if (!sessionDays.has(probe.toISOString().slice(0, 10))) {
      break;
    }

    currentStreakDays += 1;
  }

  return {
    total_attempts: totalAttempts,
    average_score: averageScore,
    modules_completed: completedModules,
    current_streak_days: currentStreakDays,
  };
}

function buildLessonSummaryMap(
  sessions: Array<{
    lesson_id: string;
    avg_score: number | null;
    passed: boolean | null;
    id: string;
  }>,
) {
  const sessionMap = new Map<string, LessonSessionSummary>();

  for (const session of sessions) {
    const existing = sessionMap.get(session.lesson_id);

    if (!existing) {
      sessionMap.set(session.lesson_id, {
        session_id: session.id,
        attempt_count: 1,
        best_score: session.avg_score,
        passed: session.passed,
      });
      continue;
    }

    sessionMap.set(session.lesson_id, {
      session_id: existing.session_id,
      attempt_count: existing.attempt_count + 1,
      best_score: Math.max(existing.best_score ?? 0, session.avg_score ?? 0),
      passed: existing.passed === true || session.passed === true,
    });
  }

  return sessionMap;
}

export function isModuleUnlocked(module: ModuleWithProgress) {
  return module.progress?.is_unlocked === true;
}

export function isModuleCompleted(module: ModuleWithProgress) {
  return module.progress?.is_completed === true;
}

export function getModuleFromModules(
  modules: ModuleWithProgress[],
  moduleSlug: string,
) {
  return modules.find((module) => module.slug === moduleSlug) ?? null;
}

export function getLessonFromLessons(
  lessons: LessonWithSummary[],
  lessonSlug: string,
) {
  return lessons.find((lesson) => lesson.slug === lessonSlug) ?? null;
}

export function sortLessons(lessons: Lesson[]) {
  return [...lessons].sort((left, right) => left.sort_order - right.sort_order);
}
