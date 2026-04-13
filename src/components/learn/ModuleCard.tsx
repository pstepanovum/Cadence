// FILE: src/components/learn/ModuleCard.tsx
"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle, Lock } from "griddy-icons";
import type { ModuleWithProgress } from "@/lib/learn";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  module: ModuleWithProgress;
}

export function ModuleCard({ module }: ModuleCardProps) {
  const focusChips = Array.isArray(module.phoneme_focus)
    ? module.phoneme_focus.filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      )
    : [];

  const progress = module.progress;
  const isUnlocked = progress?.is_unlocked === true;
  const isCompleted = progress?.is_completed === true;
  const bestScore = progress?.best_exam_score ?? null;
  const statusLabel = isCompleted
    ? "Completed"
    : isUnlocked
      ? "Unlocked"
      : "Locked";
  const ctaLabel = isCompleted ? "Review module" : "Start module";

  const content = (
    <div
      className={cn(
        "flex h-full min-h-[22rem] flex-col rounded-[2rem] px-6 py-6",
        isCompleted
          ? "bg-hunter-green text-bright-snow"
          : isUnlocked
            ? "bg-bright-snow"
            : "bg-platinum/70 select-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold",
              isCompleted
                ? "bg-yellow-green text-hunter-green"
                : isUnlocked
                  ? "bg-hunter-green text-white"
                  : "bg-pale-slate-2 text-white",
            )}
          >
            {module.sort_order}
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              isCompleted
                ? "bg-white/12 text-bright-snow"
                : isUnlocked
                  ? "bg-yellow-green/20 text-hunter-green"
                  : "bg-pale-slate text-slate-grey",
            )}
          >
            {statusLabel}
          </span>
        </div>

        {isCompleted ? (
          <CheckCircle size={20} color="currentColor" className="text-yellow-green" />
        ) : !isUnlocked ? (
          <Lock size={20} color="currentColor" className="text-pale-slate-2" />
        ) : bestScore !== null ? (
          <span className="rounded-full bg-vanilla-cream px-3 py-1 text-xs font-semibold text-hunter-green">
            {bestScore}/100
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        <h3
          className={cn(
            "text-2xl font-semibold leading-tight",
            isCompleted ? "text-bright-snow" : "text-hunter-green",
          )}
        >
          {module.title}
        </h3>
        <p
          className={cn(
            "text-sm leading-7",
            isCompleted ? "text-bright-snow/74" : "text-iron-grey",
          )}
        >
          {module.description}
        </p>
      </div>

      {focusChips.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {focusChips.slice(0, 4).map((phoneme, index) => (
            <span
              key={`${module.id}-focus-${index}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-mono font-semibold",
                isCompleted
                  ? "bg-white/12 text-bright-snow"
                  : isUnlocked
                    ? "bg-vanilla-cream text-hunter-green"
                    : "bg-pale-slate text-slate-grey",
              )}
            >
              {phoneme}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto space-y-3 pt-6">
        {isUnlocked ? (
          <div
            className={cn(
              "flex min-h-12 w-full items-center justify-between rounded-[1.5rem] px-4 py-3 text-sm font-semibold",
              isCompleted
                ? "bg-white/12 text-bright-snow"
                : "bg-hunter-green text-white",
            )}
          >
            <span>{ctaLabel}</span>
            <ArrowRight size={16} color="currentColor" />
          </div>
        ) : (
          <div className="rounded-[1.5rem] bg-white/55 px-4 py-3 text-sm leading-6 text-slate-grey">
            Complete the previous module to unlock this part of the route.
          </div>
        )}

        {bestScore !== null && !isCompleted ? (
          <p className="text-xs font-medium text-iron-grey">
            Best exam score: {bestScore}/100
          </p>
        ) : null}

        {isCompleted ? (
          <p className="text-xs font-medium text-bright-snow/66">
            Reopen the module any time to revisit theory, practice, and the exam.
          </p>
        ) : null}
      </div>
    </div>
  );

  if (!isUnlocked) {
    return content;
  }

  return (
    <Link href={`/learn/${module.slug}`} className="block h-full">
      {content}
    </Link>
  );
}
