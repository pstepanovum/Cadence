// FILE: src/components/mouth-map/SoundsToFix.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { reviewsDue, soundsToFix } from "@/components/mouth-map/sound-practice";
import { localDay, useSoundStore } from "@/components/mouth-map/sound-store";
import { ipaOf, type Variant } from "@/components/mouth-map/targets";
import { soundById } from "@/lib/platform/vocal-tract/index.ts";

export function SoundsToFix({ variant }: { variant: Variant }) {
  const store = useSoundStore();
  const fix = useMemo(() => soundsToFix(store), [store]);
  const review = useMemo(() => reviewsDue(store, localDay(new Date())), [store]);
  const suffix = variant === "RP" ? "?accent=RP" : "";

  return (
    <section aria-labelledby="to-fix" className="rounded-[20px] bg-white px-5 py-6 text-carbon-black sm:px-8">
      <h2 id="to-fix" className="font-kicker text-2xl">Your sounds to fix</h2>
      {fix.length === 0 && review.length === 0 ? (
        <p className="mt-2 max-w-2xl text-sm leading-7 text-iron-grey">
          Nothing yet. Record a word in{" "}
          <Link href="/dashboard" className="font-semibold text-slate-grey underline underline-offset-2">
            Quick practice
          </Link>{" "}
          and the sounds that need work show up here, most useful first.
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {review.map((id) => {
            const sound = soundById(id);
            return sound ? (
              <li key={`r-${id}`}>
                <Link href={`/sounds/${id}${suffix}`} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-platinum px-4 text-sm font-semibold text-carbon-black hover:bg-alabaster-grey">
                  /{ipaOf(sound, variant)}/ <span className="font-normal">review</span>
                </Link>
              </li>
            ) : null;
          })}
          {fix.map((item) => {
            const sound = soundById(item.soundId);
            return sound ? (
              <li key={item.soundId}>
                <Link
                  href={`/sounds/${item.soundId}${suffix}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-page px-4 text-sm font-semibold text-carbon-black hover:bg-platinum"
                >
                  /{ipaOf(sound, variant)}/<span className="sr-only">, average score</span>{" "}
                  <span className="font-normal text-iron-grey">{item.score}</span>
                </Link>
              </li>
            ) : null;
          })}
        </ul>
      )}
    </section>
  );
}
