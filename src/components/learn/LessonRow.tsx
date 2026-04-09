// FILE: src/components/learn/LessonRow.tsx
import { CheckCircle, ChevronRight, Lock, Play } from "griddy-icons";
import type { LessonWithSummary } from "@/lib/learn";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LessonRowProps {
  lesson: LessonWithSummary;
  moduleSlug: string;
  isLocked: boolean;
}

const typeLabel: Record<string, string> = {
  theory: "Theory",
  practice: "Practice",
  exam: "Final Exam",
};

const typeBadgeClass: Record<string, string> = {
  theory: "bg-vanilla-cream text-hunter-green",
  practice: "bg-sage-green/15 text-sage-green",
  exam: "bg-blushed-brick/15 text-blushed-brick",
};

export function LessonRow({ lesson, moduleSlug, isLocked }: LessonRowProps) {
  const summary = lesson.session_summary;
  const passed = summary?.passed === true;
  const bestScore = summary?.best_score;
  const actionLabel = passed ? "Revisit" : summary ? "Retry" : "Start";
  const statusLabel = isLocked
    ? "Locked"
    : passed
      ? "Passed"
      : lesson.lesson_type === "theory"
        ? "Read first"
        : "Ready";

  return (
    <div
      className={cn(
        "grid gap-4 rounded-[2rem] px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,10rem)] sm:items-center sm:px-5 sm:py-5",
        isLocked
          ? "bg-vanilla-cream/70"
          : passed
            ? "bg-vanilla-cream"
            : "bg-bright-snow",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            passed
              ? "bg-hunter-green text-white"
              : isLocked
                ? "bg-pale-slate text-white"
                : "bg-white text-hunter-green",
          )}
        >
          {isLocked ? <Lock size={15} color="currentColor" /> : lesson.sort_order}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-grey">
            Step {lesson.sort_order}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
              passed
                ? "bg-yellow-green/25 text-hunter-green"
                : isLocked
                  ? "bg-pale-slate text-white"
                  : "bg-white text-hunter-green",
            )}
          >
            {passed ? <CheckCircle size={12} color="currentColor" /> : null}
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              typeBadgeClass[lesson.lesson_type] ?? typeBadgeClass.theory,
            )}
          >
            {typeLabel[lesson.lesson_type] ?? lesson.lesson_type}
          </span>
          {bestScore !== null && bestScore !== undefined && !passed ? (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-iron-grey">
              Best {bestScore}/100
            </span>
          ) : null}
        </div>

        <div className="space-y-1">
          <p
            className={cn(
              "text-lg font-semibold leading-6",
              isLocked ? "text-slate-grey" : "text-hunter-green",
            )}
          >
            {lesson.title}
          </p>
          <p className="text-sm leading-6 text-iron-grey">
            {lesson.words.length > 0
              ? `${lesson.words.length} focused word${lesson.words.length > 1 ? "s" : ""}`
              : lesson.lesson_type === "theory"
                ? "Read the core pronunciation concept before the speaking drills."
                : "Guided lesson content is ready."}
          </p>
        </div>
      </div>

      {isLocked ? (
        <div className="flex items-center sm:justify-end">
          <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-grey">
            Locked
          </span>
        </div>
      ) : (
        <Button
          variant={passed ? "ghost" : "primary"}
          href={`/learn/${moduleSlug}/${lesson.slug}`}
          className="w-full sm:justify-self-end"
        >
          {passed ? (
            <ChevronRight size={15} color="currentColor" />
          ) : (
            <Play size={15} color="currentColor" />
          )}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
