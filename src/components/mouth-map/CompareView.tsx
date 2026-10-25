// FILE: src/components/mouth-map/CompareView.tsx
//
// Two sounds of a minimal pair side by side, plus a morph that moves the mouth
// from one to the other, so the single difference is what moves.
"use client";

import { useState } from "react";
import type { ArticulationTarget, SoundInfo } from "@/lib/platform/vocal-tract/index.ts";
import { MouthMap } from "@/components/mouth-map/MouthMap";
import { MouthMapSvg } from "@/components/mouth-map/MouthMapSvg";
import { speakWord } from "@/components/mouth-map/speak";
import { ipaOf, type Variant } from "@/components/mouth-map/targets";
import { useArticulation } from "@/components/mouth-map/use-articulation";

interface Side {
  sound: SoundInfo;
  target: ArticulationTarget;
  word: string;
}

export function CompareView({ a, b, variant }: { a: Side; b: Side; variant: Variant }) {
  const [toB, setToB] = useState(true);
  const [playKey, setPlayKey] = useState(0);
  const current = toB ? b : a;
  const previous = toB ? a : b;
  const { params, pulse } = useArticulation({ target: current.target, from: previous.target, playKey, durationMs: 1600 });

  function morph() {
    setToB((value) => !value);
    setPlayKey((key) => key + 1);
    speakWord(toB ? a.word : b.word, variant);
  }

  const label = (side: Side) => `/${ipaOf(side.sound, variant)}/ ${side.word}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {[a, b].map((side) => (
          <section key={side.sound.id} className="rounded-[20px] bg-white p-4 sm:p-5" aria-label={label(side)}>
            <h2 className="pb-3 font-kicker text-2xl text-carbon-black">
              {side.word} <span className="text-base text-slate-grey">/{ipaOf(side.sound, variant)}/</span>
            </h2>
            <MouthMap sound={side.sound} target={side.target} variant={variant} word={side.word} />
          </section>
        ))}
      </div>

      <section className="grid items-center gap-4 rounded-[20px] bg-white p-4 sm:p-5 md:grid-cols-[minmax(0,22rem)_1fr]">
        <MouthMapSvg
          params={params}
          highlight={current.target.highlight}
          overlays={current.target.overlays}
          anchor={current.target.anchor}
          airflow={current.target.airflow}
          pulse={pulse}
          title={`Moving from ${label(previous)} to ${label(current)}`}
          description={`The mouth moves from the shape for ${label(previous)} to the shape for ${label(current)}.`}
        />
        <div className="space-y-3">
          <p className="eyebrow text-xs text-slate-grey">Watch the difference</p>
          <p className="text-lg font-semibold text-carbon-black">
            {label(previous)} → {label(current)}
          </p>
          <p className="text-sm leading-7 text-iron-grey">
            Only one thing changes between these words. Morph back and forth and copy just that movement.
          </p>
          <button
            type="button"
            onClick={morph}
            className="min-h-11 cursor-pointer rounded-[14px] bg-hunter-green px-5 text-sm font-semibold text-white"
          >
            Morph to “{toB ? a.word : b.word}”
          </button>
        </div>
      </section>
    </div>
  );
}
