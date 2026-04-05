// FILE: src/components/learn/LessonSummary.tsx
"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCcw } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/learn/ProgressRing";

interface LessonSummaryProps {
  scores: number[];
  moduleSlug: string;
  onRetry: () => void;
}

export function LessonSummary({
  scores,
  moduleSlug,
  onRetry,
}: LessonSummaryProps) {
  const avg = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const best = scores.length ? Math.max(...scores) : 0;
  const lowest = scores.length ? Math.min(...scores) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[2rem] bg-hunter-green px-5 py-5 text-bright-snow sm:px-6 sm:py-6">
          <div className="flex items-center gap-4">
            <ProgressRing
              score={avg}
              size={96}
              strokeWidth={7}
              trackColor="rgba(255,255,255,0.18)"
              className="[&>span]:text-bright-snow"
            />
            <div className="space-y-2">
              <p className="eyebrow text-xs text-yellow-green/84">Lesson complete</p>
              <h3 className="text-3xl font-semibold text-bright-snow">
                Your pronunciation round is complete.
              </h3>
              <p className="text-sm leading-6 text-bright-snow/76">
                {scores.length} recorded word{scores.length !== 1 ? "s" : ""} in
                this practice loop.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-white/10 px-4 py-4">
            <p className="eyebrow text-xs text-yellow-green/84">Summary</p>
            <p className="mt-2 text-sm leading-6 text-bright-snow/78">
              Keep the sound you landed well, then replay the weaker word once or
              twice before moving back into the full module.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-2">
            <p className="eyebrow text-xs text-sage-green">Session breakdown</p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              One glance at how the round went.
            </h3>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-white px-4 py-4 text-center">
              <p className="eyebrow text-xs text-sage-green">Average</p>
              <p className="mt-2 text-3xl font-semibold text-hunter-green">{avg}</p>
            </div>
            <div className="rounded-3xl bg-white px-4 py-4 text-center">
              <p className="eyebrow text-xs text-sage-green">Best</p>
              <p className="mt-2 text-3xl font-semibold text-hunter-green">{best}</p>
            </div>
            <div className="rounded-3xl bg-white px-4 py-4 text-center">
              <p className="eyebrow text-xs text-blushed-brick">Needs work</p>
              <p className="mt-2 text-3xl font-semibold text-hunter-green">
                {lowest}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl bg-white px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Next move</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              Run the lesson again if you want another focused pass, or step back
              into the module to move on with the rest of the route.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="ghost" onClick={onRetry} className="flex-1">
          <RefreshCcw size={16} color="currentColor" />
          Practice Again
        </Button>
        <Button variant="primary" asChild className="flex-1 text-white">
          <Link
            href={`/learn/${moduleSlug}`}
            className="flex items-center gap-2 text-white"
          >
            <ArrowLeft size={16} color="currentColor" />
            Back to Module
          </Link>
        </Button>
      </div>
    </div>
  );
}
