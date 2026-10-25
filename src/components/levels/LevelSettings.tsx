// FILE: src/components/levels/LevelSettings.tsx
//
// Account > Level: the overall CEFR level (advanced first, with approximate
// IELTS and TOEFL iBT equivalents), optional per-skill levels and the
// placement test. Practice, the grammar browser and the coach follow a change
// at once; other levels stay open from the level picker.
"use client";

import { useEffect } from "react";
import { setOverallLevel, setSkillLevel, syncLevelsWithAccount, useLevelPrefs } from "@/components/levels/level-store";
import { Button } from "@/components/ui/button";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/platform/content-model.ts";
import { LEVELS_ADVANCED_FIRST, LEVEL_INFO, LEVEL_SKILLS, SKILL_TITLES, examLine } from "@/lib/platform/levels.ts";
import { cn } from "@/lib/utils";

const SOURCE_TEXT = { default: "Not set yet: Cadence starts at B2.", self: "Set by you.", placement: "Set by the placement test." } as const;

export function LevelSettings({ signedIn }: { signedIn: boolean }) {
  const prefs = useLevelPrefs();

  useEffect(() => {
    if (signedIn) void syncLevelsWithAccount();
  }, [signedIn]);

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="level-overall">
        <h2 id="level-overall" className="font-kicker text-xl text-carbon-black">
          Overall
        </h2>
        <p className="text-sm text-iron-grey">
          Practice, the grammar browser and the coach use this level. {SOURCE_TEXT[prefs.source]}
        </p>
        <div role="radiogroup" aria-labelledby="level-overall" className="grid gap-2">
          {LEVELS_ADVANCED_FIRST.map((level) => {
            const selected = prefs.overall === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setOverallLevel(level, signedIn)}
                className={cn(
                  "flex min-h-14 w-full cursor-pointer flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left",
                  selected ? "bg-hunter-green text-white" : "bg-platinum text-carbon-black hover:brightness-95",
                )}
              >
                <span className="font-semibold">{`${level} · ${LEVEL_INFO[level].name}`}</span>
                <span className={cn("text-sm", selected ? "text-white/85" : "text-iron-grey")}>{LEVEL_INFO[level].detail}</span>
                <span className={cn("text-xs", selected ? "text-white/75" : "text-iron-grey")}>{examLine(level)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="level-skills">
        <h2 id="level-skills" className="font-kicker text-xl text-carbon-black">
          By skill
        </h2>
        <p className="text-sm text-iron-grey">Optional. A skill set to Same follows the overall level.</p>
        {LEVEL_SKILLS.map((skill) => {
          const value = prefs.skills[skill] ?? null;
          const options: (CefrLevel | null)[] = [null, ...[...CEFR_LEVELS].reverse()];
          return (
            <div key={skill} className="space-y-1.5">
              <p className="text-sm font-semibold text-carbon-black">{SKILL_TITLES[skill]}</p>
              <div role="radiogroup" aria-label={SKILL_TITLES[skill]} className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                  const selected = option === value;
                  return (
                    <button
                      key={option ?? "same"}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSkillLevel(skill, option, signedIn)}
                      className={cn(
                        "min-h-11 min-w-12 cursor-pointer rounded-[14px] px-3 text-sm font-semibold",
                        selected ? "bg-hunter-green text-white" : "bg-platinum text-carbon-black hover:brightness-95",
                      )}
                    >
                      {option ?? "Same"}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3" aria-labelledby="level-placement">
        <h2 id="level-placement" className="font-kicker text-xl text-carbon-black">
          Placement test
        </h2>
        <p className="text-sm text-iron-grey">Adaptive, 12 to 24 questions, about five minutes. New questions each time.</p>
        <Button href="/account/level/placement">Retake placement</Button>
      </section>
    </div>
  );
}
