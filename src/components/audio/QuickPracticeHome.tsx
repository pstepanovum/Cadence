"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Microphone } from "griddy-icons";
import { useMemo, useState } from "react";
import { CoachVoiceCard } from "@/components/audio/CoachVoiceCard";
import { PracticeStudio } from "@/components/audio/PracticeStudio";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import type { ModuleWithProgress } from "@/lib/learn";
import {
  getPracticeTarget,
  PRACTICE_TARGET_OPTIONS,
} from "@/lib/practice-targets";

interface QuickPracticeHomeProps {
  modules: ModuleWithProgress[];
}

export function QuickPracticeHome({ modules }: QuickPracticeHomeProps) {
  const [selectedWord, setSelectedWord] = useState("think");
  const { settings: voiceSettings, instruct, updateSettings } = useCoachVoice();

  const currentTarget = useMemo(
    () => getPracticeTarget(selectedWord),
    [selectedWord],
  );
  const completedModules = modules.filter(
    (module) => module.progress?.is_completed,
  ).length;
  const unlockedModules = modules.filter(
    (module) => module.progress?.is_unlocked,
  ).length;
  const currentModule =
    modules.find(
      (module) => module.progress?.is_unlocked && !module.progress?.is_completed,
    ) ?? modules[0] ?? null;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <Card className="bg-hunter-green text-bright-snow">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-yellow-green">
              <Microphone size={18} filled color="currentColor" />
              <span className="eyebrow text-sm">Home</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold text-bright-snow sm:text-5xl">
                Quick practice
              </h1>
              <p className="max-w-2xl text-base leading-7 text-bright-snow/78">
                Free drill mode for supported target words. Hear the reference
                pronunciation, record one take, and let Cadence compare the
                decoded phonemes against the target.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Modules complete</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {completedModules}/{modules.length || 10}
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Unlocked now</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {unlockedModules}
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Current module</p>
                <p className="mt-2 text-base font-semibold text-bright-snow">
                  {currentModule ? `Module ${currentModule.sort_order}` : "Ready"}
                </p>
              </div>
            </div>

            <Link
              href="/learn"
              className={buttonVariants({
                variant: "secondary",
                className: "w-fit gap-2",
              })}
            >
              Open modules
              <ArrowRight size={16} color="currentColor" />
            </Link>
          </div>
        </Card>

        <Card className="bg-white">
          <div className="grid gap-5 md:grid-cols-[0.92fr_1.08fr] md:items-center">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="eyebrow text-sm text-sage-green">Session cue</p>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-hunter-green">
                    Choose a target word
                  </span>
                  <Select
                    value={selectedWord}
                    onChange={(event) => setSelectedWord(event.target.value)}
                  >
                    {PRACTICE_TARGET_OPTIONS.map((target) => (
                      <option key={target.word} value={target.word}>
                        {target.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <div className="rounded-3xl bg-vanilla-cream px-5 py-5">
                <p className="text-4xl font-semibold text-hunter-green">
                  {currentTarget.label}
                </p>
                <p className="mt-2 text-lg text-iron-grey">{currentTarget.ipa}</p>
                <p className="mt-4 text-sm leading-7 text-iron-grey">
                  {currentTarget.cue}
                </p>
              </div>

              {currentModule ? (
                <p className="text-sm leading-7 text-iron-grey">
                  Structured learning stays in Modules. Your current route is{" "}
                  <span className="font-semibold text-hunter-green">
                    Module {currentModule.sort_order}: {currentModule.title}
                  </span>
                  .
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-center">
              <Image
                src="/illustration/analysing-1.svg"
                alt="Pronunciation practice illustration"
                width={360}
                height={280}
                className="h-auto w-full max-w-xs object-contain"
                priority
              />
            </div>
          </div>
        </Card>
      </section>

      <PracticeStudio
        targetWord={currentTarget.label}
        targetPhonemes={currentTarget.ipa}
        instruct={instruct}
      />

      <CoachVoiceCard settings={voiceSettings} instruct={instruct} onUpdate={updateSettings} />
    </div>
  );
}
