// FILE: src/components/conversation/ConversationModuleCard.tsx
"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle, Lock } from "griddy-icons";
import type { ConversationModuleWithProgress } from "@/lib/conversation";
import { cn } from "@/lib/utils";

interface ConversationModuleCardProps {
  module: ConversationModuleWithProgress;
}

export function ConversationModuleCard({
  module,
}: ConversationModuleCardProps) {
  const bestScore = module.progress?.bestScore ?? null;

  const content = (
    <div
      className={cn(
        "flex h-full min-h-[23rem] flex-col rounded-[2rem] px-6 py-6",
        module.isCompleted
          ? "bg-hunter-green text-bright-snow"
          : module.isUnlocked
            ? "bg-bright-snow"
            : "bg-platinum/70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold",
              module.isCompleted
                ? "bg-yellow-green text-hunter-green"
                : module.isUnlocked
                  ? "bg-hunter-green text-white"
                  : "bg-pale-slate-2 text-white",
            )}
          >
            {module.sortOrder}
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              module.isCompleted
                ? "bg-white/12 text-bright-snow"
                : module.isUnlocked
                  ? "bg-yellow-green/20 text-hunter-green"
                  : "bg-pale-slate text-slate-grey",
            )}
          >
            {module.level}
          </span>
        </div>

        {module.isCompleted ? (
          <CheckCircle size={20} color="currentColor" className="text-yellow-green" />
        ) : !module.isUnlocked ? (
          <Lock size={18} color="currentColor" className="text-pale-slate-2" />
        ) : bestScore !== null ? (
          <span className="rounded-full bg-vanilla-cream px-3 py-1 text-xs font-semibold text-hunter-green">
            {bestScore}/100
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        <div className="space-y-1">
          <p
            className={cn(
              "eyebrow text-xs",
              module.isCompleted ? "text-yellow-green/82" : "text-sage-green",
            )}
          >
            {module.topic}
          </p>
          <h3
            className={cn(
              "text-2xl font-semibold leading-tight",
              module.isCompleted ? "text-bright-snow" : "text-hunter-green",
            )}
          >
            {module.title}
          </h3>
        </div>

        <p
          className={cn(
            "text-sm leading-7",
            module.isCompleted ? "text-bright-snow/74" : "text-iron-grey",
          )}
        >
          {module.summary}
        </p>
      </div>

      <div className="mt-5 rounded-3xl bg-white/10 px-4 py-4">
        <p
          className={cn(
            "text-sm leading-6",
            module.isCompleted ? "text-bright-snow/78" : "text-iron-grey",
          )}
        >
          {module.scenario}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {module.focus.map((item) => (
          <span
            key={item}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              module.isCompleted
                ? "bg-white/12 text-bright-snow"
                : module.isUnlocked
                  ? "bg-vanilla-cream text-hunter-green"
                  : "bg-pale-slate text-slate-grey",
            )}
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-6">
        {module.isUnlocked ? (
          <div
            className={cn(
              "flex min-h-12 w-full items-center justify-between rounded-[1.5rem] px-4 py-3 text-sm font-semibold",
              module.isCompleted
                ? "bg-white/12 text-bright-snow"
                : "bg-hunter-green text-white",
            )}
          >
            <span>{module.isCompleted ? "Review module" : "Start module"}</span>
            <ArrowRight size={16} color="currentColor" />
          </div>
        ) : (
          <div className="rounded-[1.5rem] bg-white/55 px-4 py-3 text-sm leading-6 text-slate-grey">
            Pass the previous conversation module to unlock this scenario.
          </div>
        )}

        <p
          className={cn(
            "text-xs font-medium",
            module.isCompleted ? "text-bright-snow/68" : "text-iron-grey",
          )}
        >
          Pass mark {module.passScore}+ and about {module.estimatedMinutes} minutes.
        </p>
      </div>
    </div>
  );

  if (!module.isUnlocked) {
    return content;
  }

  return (
    <Link href={`/conversation/${module.slug}`} className="block h-full">
      {content}
    </Link>
  );
}
