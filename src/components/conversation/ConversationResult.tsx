// FILE: src/components/conversation/ConversationResult.tsx
"use client";

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
        <div className="rounded-[28px] bg-white px-5 py-5 text-carbon-black sm:px-6 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <ProgressRing
              score={score}
              size={88}
              strokeWidth={7}
              trackColor="rgba(255,255,255,0.18)"
              className="[&>span]:text-bright-snow shrink-0"
            />
            <div className="space-y-2">
              <p className="eyebrow text-xs text-slate-grey">Conversation result</p>
              <h3 className="text-2xl font-semibold text-carbon-black sm:text-3xl">
                {passed ? "Module passed." : "Almost there."}
              </h3>
              <p className="text-sm leading-6 text-iron-grey">
                You need {module.passScore}+ to clear this module, and you finished
                with {score}/100.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] bg-page px-4 py-4">
            <p className="eyebrow text-xs text-slate-grey">Why it matters</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              Conversation modules are meant to prove that your sound control holds
              inside realistic speech, not only in isolated drills.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] bg-page px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-2">
            <p className="eyebrow text-xs text-slate-grey">Module summary</p>
            <h3 className="text-2xl font-semibold text-carbon-black">
              {module.title}
            </h3>
            <p className="text-sm leading-6 text-iron-grey">{module.summary}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] bg-white px-4 py-4">
              <p className="eyebrow text-xs text-slate-grey">Level</p>
              <p className="mt-2 text-2xl font-semibold text-carbon-black">
                {module.level}
              </p>
            </div>
            <div className="rounded-[20px] bg-white px-4 py-4">
              <p className="eyebrow text-xs text-slate-grey">Pass mark</p>
              <p className="mt-2 text-2xl font-semibold text-carbon-black">
                {module.passScore}
              </p>
            </div>
            <div className="rounded-[20px] bg-white px-4 py-4">
              <p className="eyebrow text-xs text-slate-grey">Turns</p>
              <p className="mt-2 text-2xl font-semibold text-carbon-black">
                {module.turns.length}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[20px] bg-white px-4 py-4">
            <p className="eyebrow text-xs text-slate-grey">Next move</p>
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
          <Button variant="primary" href={`/conversation/${nextModuleSlug}`} className="flex-1">
            Next Module
            <ArrowRight size={16} color="currentColor" />
          </Button>
        ) : (
          <Button variant="primary" href="/conversation" className="flex-1">
            All Conversation Modules
          </Button>
        )}
      </div>
    </div>
  );
}
