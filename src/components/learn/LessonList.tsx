// FILE: src/components/learn/LessonList.tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "griddy-icons";
import type { LessonWithSummary, ModuleWithProgress } from "@/lib/learn";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { LessonRow } from "@/components/learn/LessonRow";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { Button } from "@/components/ui/button";

interface LessonListProps {
  module: ModuleWithProgress;
  lessons: LessonWithSummary[];
}

export function LessonList({ module, lessons }: LessonListProps) {
  const isCompleted = module.progress?.is_completed === true;
  const completedCount = lessons.filter((lesson) => lesson.session_summary?.passed).length;
  const completionRate = Math.round(
    (completedCount / Math.max(lessons.length, 1)) * 100,
  );
  const theoryCount = lessons.filter((lesson) => lesson.lesson_type === "theory").length;
  const practiceCount = lessons.filter((lesson) => lesson.lesson_type === "practice").length;
  const examCount = lessons.filter((lesson) => lesson.lesson_type === "exam").length;

  const moduleStatus = isCompleted
    ? "This module is complete. Revisit any lesson whenever you want a quick refresh."
    : completedCount === 0
      ? "Start with the theory cue, then move into guided word practice and finish with the exam."
      : completedCount >= lessons.length - examCount
        ? "You are close to the finish line. Wrap the last lesson to complete this module."
        : "Keep moving through the lesson path to unlock the next speaking round.";

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden bg-white p-0">
        <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 bg-hunter-green px-6 py-6 text-bright-snow sm:px-7 sm:py-7">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-yellow-green text-sm font-bold text-hunter-green">
                  {module.sort_order}
                </span>
                <span className="eyebrow text-sm text-yellow-green/82">
                  Module {module.sort_order}
                </span>
              </div>

              <div className="space-y-2">
                <CardTitle className="text-3xl text-bright-snow sm:text-4xl">
                  {module.title}
                </CardTitle>
                <CardDescription className="max-w-3xl text-bright-snow/72">
                  {module.description}
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {module.phoneme_focus.map((phoneme) => (
                <span
                  key={phoneme}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-bright-snow"
                >
                  {phoneme}
                </span>
              ))}
            </div>

            <div className="rounded-3xl bg-white/10 px-5 py-4">
              <p className="text-sm leading-7 text-bright-snow/78">{moduleStatus}</p>
            </div>
          </div>

          <div className="space-y-5 bg-white px-6 py-6 sm:px-7 sm:py-7">
            <div className="flex items-center gap-4">
              <ProgressRing score={completionRate} size={96} strokeWidth={7} />
              <div className="space-y-2">
                <p className="eyebrow text-sm text-sage-green">Module progress</p>
                <p className="text-2xl font-semibold text-hunter-green">
                  {completedCount}/{lessons.length} lessons passed
                </p>
                <p className="text-sm leading-6 text-iron-grey">
                  {completionRate}% of this module is complete.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-platinum px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Theory</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {theoryCount}
                </p>
              </div>
              <div className="rounded-3xl bg-platinum px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Practice</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {practiceCount}
                </p>
              </div>
              <div className="rounded-3xl bg-platinum px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Exam</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {examCount}
                </p>
              </div>
            </div>

            <div className="rounded-full bg-platinum p-2">
              <div
                className="h-3 rounded-full bg-hunter-green"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-sm text-iron-grey">
              <span>Lesson path</span>
              <span>{completionRate}% complete</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <p className="eyebrow text-sm text-sage-green">Lesson path</p>
              <CardTitle className="text-2xl">
                Move through each lesson in order.
              </CardTitle>
            </div>
            <div className="rounded-full bg-vanilla-cream px-4 py-2 text-sm font-semibold text-hunter-green">
              {lessons.length} total lessons
            </div>
          </div>

          <div className="space-y-3">
            {lessons.map((lesson, index) => {
              const previousSpeakingLessons = lessons
                .slice(0, index)
                .filter((item) => item.lesson_type !== "theory");
              const previousPassed =
                previousSpeakingLessons.length === 0 ||
                previousSpeakingLessons[previousSpeakingLessons.length - 1]?.session_summary?.passed === true;

              const isLocked =
                lesson.lesson_type !== "theory" &&
                !previousPassed &&
                !isCompleted &&
                index > 0;

              return (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  moduleSlug={module.slug}
                  isLocked={isLocked}
                />
              );
            })}
          </div>
        </div>
      </Card>

      <div className="flex gap-3">
        <Button variant="ghost" asChild>
          <Link href="/learn" className="flex items-center gap-2">
            <ArrowLeft size={16} color="currentColor" />
            All Modules
          </Link>
        </Button>
      </div>
    </div>
  );
}
