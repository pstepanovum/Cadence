// FILE: src/components/learn/ModuleGrid.tsx
"use client";

import Image from "next/image";
import type { ModuleWithProgress } from "@/lib/learn";
import { ModuleCard } from "@/components/learn/ModuleCard";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { Card } from "@/components/ui/card";

interface ModuleGridProps {
  modules: ModuleWithProgress[];
}

export function ModuleGrid({ modules }: ModuleGridProps) {
  const completed = modules.filter((module) => module.progress?.is_completed).length;
  const unlocked = modules.filter((module) => module.progress?.is_unlocked).length;
  const completionRate = Math.round(
    (completed / Math.max(modules.length, 1)) * 100,
  );
  const currentModule =
    modules.find(
      (module) => module.progress?.is_unlocked && !module.progress?.is_completed,
    ) ??
    modules[0] ??
    null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
        <Card className="bg-hunter-green text-bright-snow">
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="eyebrow text-sm text-yellow-green/82">Modules</p>
              <h1 className="text-4xl font-semibold text-bright-snow sm:text-5xl">
                A structured pronunciation route, not a loose stack of drills.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-bright-snow/78">
                Each module moves from theory to guided practice and then into a
                scored exam, so the learner always knows what comes next.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Complete</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {completed}/{modules.length}
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Unlocked</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {unlocked}
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Progress</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {completionRate}%
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white">
          <div className="grid gap-5 md:grid-cols-[0.92fr_1.08fr] md:items-center">
            <div className="flex items-center justify-center">
              <Image
                src="/illustration/figuring-it-out-1.svg"
                alt="Structured learning illustration"
                width={320}
                height={260}
                className="h-auto w-full max-w-[15rem] object-contain"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="eyebrow text-sm text-sage-green">Current route</p>
                <h2 className="text-3xl font-semibold text-hunter-green">
                  {currentModule
                    ? `Module ${currentModule.sort_order}: ${currentModule.title}`
                    : "Start with your first module"}
                </h2>
                <p className="text-sm leading-7 text-iron-grey">
                  {currentModule?.description ??
                    "Module 1 unlocks automatically, so the full learning route is ready from the first session."}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <ProgressRing score={completionRate} size={88} strokeWidth={7} />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-hunter-green">
                    {completed} modules finished
                  </p>
                  <p className="text-sm leading-6 text-iron-grey">
                    {Math.max(unlocked - completed, 0)} modules are open now for
                    the next speaking round.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Route note</p>
                <p className="mt-2 text-sm leading-6 text-iron-grey">
                  Passing an exam keeps the module path moving, so progress feels
                  earned and easy to follow.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <ModuleCard
            key={module.slug || `module-${module.sort_order}`}
            module={module}
          />
        ))}
      </div>
    </div>
  );
}
