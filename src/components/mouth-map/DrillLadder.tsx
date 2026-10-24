// FILE: src/components/mouth-map/DrillLadder.tsx
//
// Where the learner is on this sound's drill ladder, from the device's records.
"use client";

import { DRILL_STEP_LABELS, DRILL_STEPS, TAKES_TO_PASS, GOOD_SCORE } from "@/components/mouth-map/sound-practice";
import { useSoundStore } from "@/components/mouth-map/sound-store";
import { cn } from "@/lib/utils";

export function DrillLadder({ soundId }: { soundId: string }) {
  const record = useSoundStore()[soundId] ?? null;

  const step = record?.drill?.step ?? 0;
  return (
    <section aria-labelledby="ladder" className="rounded-3xl bg-white px-5 py-6 sm:px-6">
      <h2 id="ladder" className="font-kicker text-xl text-hunter-green">Practice steps</h2>
      <p className="mt-1 text-sm leading-6 text-iron-grey">
        Each step passes after {TAKES_TO_PASS} takes in a row at {GOOD_SCORE} or more.
        {record ? ` Average so far: ${Math.round(record.ema)} over ${record.attempts} takes.` : ""}
      </p>
      <ol className="mt-3 space-y-1.5">
        {DRILL_STEPS.map((id, index) => (
          <li
            key={id}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm",
              index < step ? "bg-yellow-green text-hunter-green" : index === step ? "bg-vanilla-cream font-semibold text-hunter-green" : "text-slate-grey",
            )}
          >
            <span aria-hidden="true" className="w-4 text-center">{index < step ? "✓" : index + 1}</span>
            {DRILL_STEP_LABELS[id]}
            <span className="sr-only">{index < step ? ", done" : index === step ? ", current step" : ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
