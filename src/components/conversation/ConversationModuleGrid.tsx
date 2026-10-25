// FILE: src/components/conversation/ConversationModuleGrid.tsx
"use client";

import Image from "next/image";
import type { ConversationModuleWithProgress } from "@/lib/conversation";
import { ConversationModuleCard } from "@/components/conversation/ConversationModuleCard";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { Card } from "@/components/ui/card";

interface ConversationModuleGridProps {
  modules: ConversationModuleWithProgress[];
}

export function ConversationModuleGrid({
  modules,
}: ConversationModuleGridProps) {
  const completed = modules.filter((module) => module.isCompleted).length;
  const unlocked = modules.filter((module) => module.isUnlocked).length;
  const completionRate = Math.round(
    (completed / Math.max(modules.length, 1)) * 100,
  );
  const currentModule =
    modules.find((module) => module.isUnlocked && !module.isCompleted) ??
    modules[0] ??
    null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="bg-white text-carbon-black">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="eyebrow text-sm text-slate-grey">Track structure</p>
              <h1 className="text-3xl font-semibold text-carbon-black sm:text-4xl lg:text-5xl">
                Two tracks, one accent goal.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-iron-grey">
                Sound modules sharpen individual phonemes. Conversation modules
                move that control into realistic exchanges, where rhythm, word
                choice, and response timing all matter together.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] bg-page px-4 py-4">
                <p className="eyebrow text-xs text-slate-grey">Conversation modules</p>
                <p className="mt-2 text-2xl font-semibold text-carbon-black">
                  {completed}/{modules.length}
                </p>
              </div>
              <div className="rounded-[20px] bg-page px-4 py-4">
                <p className="eyebrow text-xs text-slate-grey">Unlocked now</p>
                <p className="mt-2 text-2xl font-semibold text-carbon-black">
                  {unlocked}
                </p>
              </div>
              <div className="rounded-[20px] bg-page px-4 py-4">
                <p className="eyebrow text-xs text-slate-grey">Pass standard</p>
                <p className="mt-2 text-2xl font-semibold text-carbon-black">
                  High
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white">
          <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div className="flex items-center justify-center">
              <Image
                src="/illustration/communication-1.svg"
                alt="Conversation practice illustration"
                width={320}
                height={260}
                className="h-auto w-full max-w-[15rem] object-contain"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="eyebrow text-sm text-slate-grey">Current route</p>
                <h2 className="text-3xl font-semibold text-carbon-black">
                  {currentModule
                    ? `${currentModule.title}`
                    : "Start with the first conversation module"}
                </h2>
                <p className="text-sm leading-7 text-iron-grey">
                  {currentModule?.scenario ??
                    "Each conversation module runs like a guided chat with scored spoken replies."}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <ProgressRing score={completionRate} size={80} strokeWidth={7} className="shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-carbon-black">
                    {completed} conversation modules passed
                  </p>
                  <p className="text-sm leading-6 text-iron-grey">
                    Move from controlled exchanges into more demanding professional
                    conversation.
                  </p>
                </div>
              </div>

              <div className="rounded-[20px] bg-page px-4 py-4">
                <p className="eyebrow text-xs text-slate-grey">Format</p>
                <p className="mt-2 text-sm leading-6 text-iron-grey">
                  The coach speaks first, you reply with a target phrase, and
                  Cadence scores pronunciation quality before the next turn.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <ConversationModuleCard key={module.slug} module={module} />
        ))}
      </div>
    </div>
  );
}
