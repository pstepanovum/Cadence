// FILE: src/components/mouth-map/MouthMapDemo.tsx
//
// The landing page's live mouth map: morphs between a few sounds on a timer,
// or on a tap. Stops cycling when reduced motion is on.
"use client";

import { useEffect, useState } from "react";
import { MouthMapSvg } from "@/components/mouth-map/MouthMapSvg";
import { useArticulation } from "@/components/mouth-map/use-articulation";
import type { ArticulationTarget } from "@/lib/platform/vocal-tract/index.ts";

export interface DemoSound {
  label: string;
  target: ArticulationTarget;
}

export function MouthMapDemo({ sounds }: { sounds: DemoSound[] }) {
  const [index, setIndex] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const current = sounds[index];
  const previous = sounds[(index + sounds.length - 1) % sounds.length];
  const { params, pulse } = useArticulation({ target: current.target, from: previous.target, playKey, durationMs: 1400 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % sounds.length);
      setPlayKey((k) => k + 1);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [sounds.length]);

  return (
    <div className="space-y-3">
      <MouthMapSvg
        params={params}
        highlight={current.target.highlight}
        overlays={current.target.overlays}
        anchor={current.target.anchor}
        airflow={current.target.airflow}
        pulse={pulse}
        title={`Mouth map: ${current.label}`}
        description={`A side view of the mouth moving into the shape for ${current.label}.`}
      />
      <div role="tablist" aria-label="Sounds" className="flex flex-wrap justify-center gap-2">
        {sounds.map((sound, i) => (
          <button
            key={sound.label}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setIndex(i);
              setPlayKey((k) => k + 1);
            }}
            className={`min-h-10 cursor-pointer rounded-[14px] px-4 text-sm font-semibold ${i === index ? "bg-hunter-green text-white" : "bg-page text-carbon-black"}`}
          >
            {sound.label}
          </button>
        ))}
      </div>
    </div>
  );
}
