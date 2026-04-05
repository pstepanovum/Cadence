// FILE: src/components/learn/ExamResult.tsx
"use client";

import Link from "next/link";
import { ArrowRight, LockOpen, RefreshCcw, Trophy } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { cn } from "@/lib/utils";

interface ExamResultProps {
  score: number;
  moduleId: number;
  moduleSlug: string;
  nextModuleSlug: string | null;
  onRetry: () => void;
}

export function ExamResult({
  score,
  moduleId,
  moduleSlug,
  nextModuleSlug,
  onRetry,
}: ExamResultProps) {
  const passed = score >= 70;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div
          className={cn(
            "rounded-[2rem] px-5 py-5 sm:px-6 sm:py-6",
            passed ? "bg-hunter-green text-bright-snow" : "bg-white",
          )}
        >
          <div className="flex items-center gap-4">
            <ProgressRing
              score={score}
              size={96}
              strokeWidth={7}
              trackColor={passed ? "rgba(255,255,255,0.18)" : "#dee2e6"}
              className={passed ? "[&>span]:text-bright-snow" : undefined}
            />
            <div className="space-y-2">
              <p
                className={cn(
                  "eyebrow text-xs",
                  passed ? "text-yellow-green/84" : "text-sage-green",
                )}
              >
                Final exam score
              </p>
              <h3
                className={cn(
                  "text-3xl font-semibold",
                  passed ? "text-bright-snow" : "text-hunter-green",
                )}
              >
                {passed ? "Module complete." : "One more pass."}
              </h3>
              <p
                className={cn(
                  "text-sm leading-6",
                  passed ? "text-bright-snow/76" : "text-iron-grey",
                )}
              >
                {passed
                  ? `You landed ${score}/100, which clears this module and keeps the route moving.`
                  : `You landed ${score}/100. Reach 70 or higher to unlock the next module.`}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "mt-5 rounded-3xl px-4 py-4",
              passed ? "bg-white/10" : "bg-vanilla-cream",
            )}
          >
            <p
              className={cn(
                "eyebrow text-xs",
                passed ? "text-yellow-green/84" : "text-sage-green",
              )}
            >
              What this means
            </p>
            <p
              className={cn(
                "mt-2 text-sm leading-6",
                passed ? "text-bright-snow/78" : "text-iron-grey",
              )}
            >
              {passed
                ? moduleId < 10
                  ? `Module ${moduleId + 1} is now available, so you can move into the next sound family right away.`
                  : "You have completed the full learning route and can revisit any module whenever you want."
                : "Review the weaker sounds, then rerun the exam when the target phonemes feel steadier."}
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-2">
            <p className="eyebrow text-xs text-sage-green">Route update</p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              {passed
                ? "The structured path keeps moving."
                : "The module stays open for another try."}
            </h3>
          </div>

          <div className="mt-4 rounded-3xl bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              {passed ? (
                moduleId < 10 ? (
                  <LockOpen size={18} color="#386641" />
                ) : (
                  <Trophy size={18} color="#386641" />
                )
              ) : (
                <RefreshCcw size={18} color="#386641" />
              )}
              <p className="text-sm font-semibold text-hunter-green">
                {passed
                  ? moduleId < 10
                    ? `Module ${moduleId + 1} unlocked`
                    : "Full course complete"
                  : "Retry available right now"}
              </p>
            </div>
            <p className="mt-3 text-sm leading-6 text-iron-grey">
              {passed
                ? "You can keep momentum by opening the next module, or revisit this one to sharpen the same sound set."
                : "There is no penalty for another round. Use the retry to clean up the same words with a steadier take."}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Pass mark</p>
              <p className="mt-2 text-2xl font-semibold text-hunter-green">70+</p>
            </div>
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Your score</p>
              <p className="mt-2 text-2xl font-semibold text-hunter-green">
                {score}/100
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {!passed ? (
          <Button variant="ghost" onClick={onRetry} className="flex-1">
            Retry Exam
          </Button>
        ) : null}

        {passed && nextModuleSlug ? (
          <Button variant="primary" asChild className="flex-1 text-white">
            <Link
              href={`/learn/${nextModuleSlug}`}
              className="flex items-center gap-2 text-white"
            >
              Next Module
              <ArrowRight size={16} color="currentColor" />
            </Link>
          </Button>
        ) : (
          <Button variant="primary" asChild className="flex-1 text-white">
            <Link href="/learn" className="text-white">
              All Modules
            </Link>
          </Button>
        )}

        <Button variant="ghost" asChild className="flex-1">
          <Link href={`/learn/${moduleSlug}`}>Module Overview</Link>
        </Button>
      </div>
    </div>
  );
}
