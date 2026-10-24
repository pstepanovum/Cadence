// FILE: src/components/mouth-map/MouthMap.tsx
//
// The mouth map for one sound: side view, front lip view, a legend whose
// entries highlight their layer, and a button that replays the movement and
// says the model word.
"use client";

import { useState } from "react";
import { useClientCheck } from "@/hooks/use-stored";
import type { ArticulationTarget, LayerId, SoundInfo } from "@/lib/platform/vocal-tract/index.ts";
import { describeForScreenReader, howTo, LAYER_LABELS } from "@/components/mouth-map/copy";
import { FrontLipsSvg } from "@/components/mouth-map/FrontLipsSvg";
import { MouthMapSvg } from "@/components/mouth-map/MouthMapSvg";
import { canSpeak, speakWord } from "@/components/mouth-map/speak";
import { ipaOf, type Variant } from "@/components/mouth-map/targets";
import { useArticulation } from "@/components/mouth-map/use-articulation";
import { cn } from "@/lib/utils";

interface MouthMapProps {
  sound: SoundInfo;
  target: ArticulationTarget;
  variant: Variant;
  /** Word to play; defaults to the sound's example. */
  word?: string;
  /** Morph in from this sound (compare view). */
  from?: ArticulationTarget | null;
  compact?: boolean;
  className?: string;
}

export function MouthMap({ sound, target, variant, word, from = null, compact = false, className }: MouthMapProps) {
  const [playKey, setPlayKey] = useState(0);
  const [focusLayer, setFocusLayer] = useState<LayerId | null>(null);
  const speech = useClientCheck(canSpeak);
  const { params, pulse } = useArticulation({ target, from, playKey });
  const ipa = ipaOf(sound, variant);
  const name = `/${ipa}/ as in “${word ?? sound.example}”`;
  const spoken = word ?? sound.example;

  function play() {
    setPlayKey((key) => key + 1);
    speakWord(spoken, variant);
  }

  return (
    <figure className={cn("space-y-3", className)}>
      <div className={cn("grid gap-3", compact ? "" : "sm:grid-cols-[1fr_9rem]")}>
        <MouthMapSvg
          params={params}
          highlight={target.highlight}
          overlays={target.overlays}
          anchor={target.anchor}
          airflow={target.airflow}
          pulse={pulse}
          focusLayer={focusLayer}
          title={`Mouth map for ${name}`}
          description={describeForScreenReader(name, target)}
        />
        {!compact ? (
          <div className="flex flex-row items-start gap-3 sm:flex-col">
            <div className="w-36 max-w-[45%] sm:w-full sm:max-w-none">
              <FrontLipsSvg params={params} />
              <p className="mt-1 text-center text-xs text-slate-grey">Front view</p>
            </div>
            <button
              type="button"
              onClick={play}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-hunter-green px-4 text-sm font-semibold text-white sm:w-full sm:flex-none"
              aria-label={speech ? `Play “${spoken}” and replay the movement` : "Replay the movement"}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          </div>
        ) : null}
      </div>

      {!compact ? (
        <>
          <figcaption className="space-y-2 text-sm leading-7 text-iron-grey">
            {howTo(target).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </figcaption>
          <div>
            <p className="eyebrow pb-2 text-xs text-sage-green">Parts of the mouth</p>
            <ul className="flex flex-wrap gap-2">
              {target.highlight.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onMouseEnter={() => setFocusLayer(id)}
                    onMouseLeave={() => setFocusLayer(null)}
                    onFocus={() => setFocusLayer(id)}
                    onBlur={() => setFocusLayer(null)}
                    aria-label={`Show the ${LAYER_LABELS[id].toLowerCase()}`}
                    className="min-h-9 cursor-pointer rounded-full bg-yellow-green px-3 text-sm font-semibold text-hunter-green"
                  >
                    {LAYER_LABELS[id]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </figure>
  );
}
