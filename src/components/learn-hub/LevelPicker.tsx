// FILE: src/components/learn-hub/LevelPicker.tsx
"use client";

import { useState } from "react";
import { useLevelPrefs } from "@/components/levels/level-store";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/platform/content-model.ts";
import { levelFor } from "@/lib/platform/levels.ts";
import { cn } from "@/lib/utils";

/**
 * The level a page shows: one picked on this page (or in its URL), else the
 * learner's level (Account > Level), so a change there applies at once.
 * Picking another level here browses it without changing the learner's level.
 */
export function useLevel(initial: CefrLevel | null) {
  const learner = levelFor(useLevelPrefs(), "grammar");
  const [chosen, setChosen] = useState<CefrLevel | null>(initial);
  const level: CefrLevel = chosen ?? learner;
  const setLevel = (next: CefrLevel) => {
    setChosen(next);
    const url = new URL(window.location.href);
    url.searchParams.set("level", next);
    window.history.replaceState(null, "", url);
  };
  return [level, setLevel] as const;
}

export function LevelPicker({ level, onChange }: { level: CefrLevel; onChange: (level: CefrLevel) => void }) {
  return (
    <div role="radiogroup" aria-label="Level" className="flex flex-wrap gap-1.5">
      {CEFR_LEVELS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === level}
          onClick={() => onChange(option)}
          className={cn(
            "min-h-11 min-w-12 cursor-pointer rounded-full px-3 text-sm font-semibold",
            option === level ? "bg-hunter-green text-white" : "bg-vanilla-cream text-hunter-green hover:bg-platinum",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
