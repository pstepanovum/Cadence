// FILE: src/app/(dashboard)/sounds/compare/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { parseVariant } from "@/components/mouth-map/AccentSwitch";
import { CompareView } from "@/components/mouth-map/CompareView";
import { loadArticulationTargets } from "@/components/mouth-map/load-targets";
import { MINIMAL_PAIRS, targetFor } from "@/components/mouth-map/targets";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { soundById } from "@/lib/platform/vocal-tract/index.ts";

export const metadata: Metadata = {
  title: "Compare sounds",
  description: "Two English sounds side by side, and the one movement that tells them apart.",
};

interface Props {
  searchParams: Promise<{ a?: string; b?: string; words?: string; accent?: string }>;
}

export default async function ComparePage({ searchParams }: Props) {
  const query = await searchParams;
  const variant = parseVariant(query.accent);
  const fallback = MINIMAL_PAIRS[0];
  const soundA = soundById(query.a ?? "") ?? soundById(fallback.a)!;
  const soundB = soundById(query.b ?? "") ?? soundById(fallback.b)!;
  const words = (query.words ?? "").split(",").map((w) => w.trim().slice(0, 30)).filter(Boolean);
  const { targets } = await loadArticulationTargets();
  const targetA = targetFor(targets, soundA.id, variant);
  const targetB = targetFor(targets, soundB.id, variant);

  return (
    <AppPage current="sounds">
      <AppIntro eyebrow="Compare" title={`${words[0] ?? soundA.example} or ${words[1] ?? soundB.example}?`}>
        Two words, one different sound. Watch what moves, then say both.
      </AppIntro>
      {targetA && targetB ? (
        <CompareView
          variant={variant}
          a={{ sound: soundA, target: targetA, word: words[0] ?? soundA.example }}
          b={{ sound: soundB, target: targetB, word: words[1] ?? soundB.example }}
        />
      ) : (
        <p className="rounded-3xl bg-white px-5 py-6 text-sm text-iron-grey">
          One of these sounds has no mouth map yet. <Link href="/sounds" className="font-semibold text-sage-text">Back to all sounds</Link>
        </p>
      )}
    </AppPage>
  );
}
