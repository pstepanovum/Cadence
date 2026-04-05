// FILE: src/components/conversation/ConversationResult.tsx
"use client";

import Link from "next/link";
import { ArrowRight, RefreshCcw } from "griddy-icons";
import type { ConversationModule } from "@/lib/conversation";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { Button } from "@/components/ui/button";

interface ConversationResultProps {
  module: ConversationModule;
  score: number;
  nextModuleSlug: string | null;
  onRetry: () => void;
}

export function ConversationResult({
  module,
  score,
  nextModuleSlug,
  onRetry,
}: ConversationResultProps) {
  const passed = score >= module.passScore;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[2rem] bg-hunter-green px-5 py-5 text-bright-snow sm:px-6 sm:py-6">
          <div className="flex items-center gap-4">
            <ProgressRing
              score={score}
              size={96}
              strokeWidth={7}
              trackColor="rgba(255,255,255,0.18)"
              className="[&>span]:text-bright-snow"
            />
            <div className="space-y-2">
              <p className="eyebrow text-xs text-yellow-green/84">Conversation result</p>
              <h3 className="text-3xl font-semibold text-bright-snow">
                {passed ? "Module passed." : "Almost there."}
              </h3>
              <p className="text-sm leading-6 text-bright-snow/76">
                You need {module.passScore}+ to clear this module, and you finished
                with {score}/100.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-white/10 px-4 py-4">
            <p className="eyebrow text-xs text-yellow-green/84">Why it matters</p>
            <p className="mt-2 text-sm leading-6 text-bright-snow/78">
              Conversation modules are meant to prove that your sound control holds
              inside realistic speech, not only in isolated drills.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-2">
            <p className="eyebrow text-xs text-sage-green">Module summary</p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              {module.title}
            </h3>
            <p className="text-sm leading-6 text-iron-grey">{module.summary}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Level</p>
              <p className="mt-2 text-2xl font-semibold text-hunter-green">
                {module.level}
              </p>
            </div>
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Pass mark</p>
              <p className="mt-2 text-2xl font-semibold text-hunter-green">
                {module.passScore}
              </p>
            </div>
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Turns</p>
              <p className="mt-2 text-2xl font-semibold text-hunter-green">
                {module.turns.length}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl bg-white px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Next move</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              {passed
                ? "Move into the next scenario while the rhythm is still fresh, or revisit this one if you want an even cleaner pass."
                : "Replay the scenario, clean up the weaker phrases, and aim for a steadier average across the whole conversation."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="ghost" onClick={onRetry} className="flex-1">
          <RefreshCcw size={16} color="currentColor" />
          Retry Module
        </Button>
        {passed && nextModuleSlug ? (
          <Button variant="primary" asChild className="flex-1 text-white">
            <Link
              href={`/conversation/${nextModuleSlug}`}
              className="flex items-center gap-2 text-white"
            >
              Next Module
              <ArrowRight size={16} color="currentColor" />
            </Link>
          </Button>
        ) : (
          <Button variant="primary" asChild className="flex-1 text-white">
            <Link href="/conversation" className="text-white">
              All Conversation Modules
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
