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
import {
  averageScore,
  currentStreakDays,
  summarizeLessonSessions,
  toUserProgress,
} from "@/lib/cloud/progress-logic";
import {
  getLearningTotals,
  getModuleProgress,
  listEndedLessonSessions,
  listModuleProgress,
} from "@/lib/cloud/store";

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

  const progress = await listModuleProgress(userId);

  return catalog.modules.map((module) => {
    const record = progress.get(module.id);
    return { ...module, progress: record ? toUserProgress(record) : null };
  });
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

  const [progress, sessions] = await Promise.all([
    getModuleProgress(userId, moduleEntry.id),
    listEndedLessonSessions(
      userId,
      lessons.map((lesson) => lesson.id),
    ),
  ]);

  const sessionMap = summarizeLessonSessions(sessions);

  return {
    module: {
      ...moduleEntry,
      progress: progress ? toUserProgress(progress) : null,
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

  const totals = await getLearningTotals(userId);

  return {
    total_attempts: totals.attemptCount,
    average_score: averageScore(totals.attemptCount, totals.scoreSum),
    modules_completed: completedModules,
    current_streak_days: currentStreakDays(totals.sessionStarts, new Date()),
  };
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
