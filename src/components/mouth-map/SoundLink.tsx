// FILE: src/components/mouth-map/SoundLink.tsx
//
// Ties pronunciation results to the mouth map: a link from a scored sound to
// its page (which offers "Record again" back to where the learner was), and a
// recorder that adds each result's phoneme scores to the device's per-sound
// records, which feed "sounds to fix".
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { recordPhonemeScores } from "@/components/mouth-map/sound-store";
import { soundIdFromSymbol } from "@/components/mouth-map/targets";
import { cn } from "@/lib/utils";

export function SoundLink({ symbol, className, children }: { symbol: string; className?: string; children?: React.ReactNode }) {
  const pathname = usePathname();
  const soundId = soundIdFromSymbol(symbol);
  if (!soundId) return null;
  return (
    <Link
      href={`/sounds/${soundId}?back=${encodeURIComponent(pathname || "/dashboard")}`}
      className={cn("inline-flex min-h-9 items-center gap-1 text-sm font-semibold underline underline-offset-2", className)}
      aria-label={`See where ${symbol} is made in the mouth`}
    >
      {children ?? "See it in the mouth"}
    </Link>
  );
}

/** Records the phoneme scores of one assessment, once per assessment. */
export function RecordPhonemes({ phonemes }: { phonemes: readonly { expected: string; accuracy: number }[] }) {
  const last = useRef<readonly unknown[] | null>(null);
  useEffect(() => {
    if (last.current === phonemes || phonemes.length === 0) return;
    last.current = phonemes;
    recordPhonemeScores(
      phonemes
        .filter((p) => p.expected && p.expected !== "/-/")
        .map((p) => ({ phoneme: p.expected, score: p.accuracy })),
    );
  }, [phonemes]);
  return null;
}
