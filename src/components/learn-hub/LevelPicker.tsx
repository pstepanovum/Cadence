// FILE: src/components/learn-hub/LevelPicker.tsx
"use client";

import { useState } from "react";
import { useStoredString, writeStored } from "@/hooks/use-stored";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/platform/content-model.ts";
import { parseLevel } from "@/components/learn-hub/packs";
import { cn } from "@/lib/utils";

const KEY = "cadence.level";

/** The level the learner last chose on this device, B1 until they choose. */
export function useLevel(initial: CefrLevel | null) {
  const saved = parseLevel(useStoredString(KEY));
  const [chosen, setChosen] = useState<CefrLevel | null>(initial);
  const level: CefrLevel = chosen ?? saved ?? "B1";
  const setLevel = (next: CefrLevel) => {
    setChosen(next);
    writeStored(KEY, next);
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
