// FILE: src/components/learn-hub/PracticeHub.tsx
//
// The learning hub: the level, today's numbers, and every kind of practice.
// Works the same signed in, signed out, local or cloud; nothing here needs AI.
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { LevelPicker, useLevel } from "@/components/learn-hub/LevelPicker";
import { PRACTICE_MODES } from "@/components/learn-hub/modes";
import { usePack } from "@/components/learn-hub/packs";
import { useCardStates, useSummary } from "@/components/learn-hub/progress";
import { ShareCardButton } from "@/components/learn-hub/ShareCard";
import { buildQueue, dayKey } from "@/components/learn-hub/srs";
import { Button } from "@/components/ui/button";
import type { CefrLevel } from "@/lib/platform/content-model.ts";
import { currentStreak } from "@/lib/platform/progress-model.ts";

export function PracticeHub({ initialLevel }: { initialLevel: CefrLevel | null }) {
  const [level, setLevel] = useLevel(initialLevel);
  const pack = usePack(level);
  const summary = useSummary();
  const cardStates = useCardStates();
  const due = useMemo(() => {
    if (!pack) return 0;
    const ids = pack.content.exercises.filter((e) => e.kind === "flashcard").map((e) => e.id);
    return buildQueue(ids, cardStates, new Date(), 0).length;
  }, [pack, cardStates]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const mode of PRACTICE_MODES) {
      map.set(mode.id, pack ? pack.content.exercises.filter((e) => mode.kinds.includes(e.kind)).length : 0);
    }
    return map;
  }, [pack]);

  const streak = currentStreak(summary, dayKey(new Date()));
  const isNew = summary.lastActiveAt === null;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl bg-white px-5 py-6 sm:px-8">
          <p className="eyebrow text-sm text-sage-green">Practice</p>
          <h1 className="mt-1 text-3xl font-semibold text-hunter-green sm:text-4xl">What do you want to practise?</h1>
          <p className="mt-2 text-sm leading-7 text-iron-grey">Choose your level. Everything here works offline and is free.</p>
          <div className="mt-4">
            <LevelPicker level={level} onChange={setLevel} />
          </div>
        </div>
        <div className="rounded-3xl bg-hunter-green px-5 py-6 text-white sm:px-8">
          {isNew ? (
            <div className="space-y-3">
              <p className="eyebrow text-sm text-yellow-green">Start here</p>
              <p className="text-2xl font-semibold">No practice yet. A five-minute quiz is a good first step.</p>
              <Button variant="secondary" href={`/practice/quiz?level=${level}`}>Start a quiz</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Day streak" value={String(streak)} />
                <Stat label="Minutes" value={String(summary.totalMinutes)} />
                <Stat label="Cards due" value={pack ? String(due) : "–"} />
              </div>
              <ShareCardButton summary={summary} streak={streak} />
            </div>
          )}
        </div>
      </section>

      <section aria-label="Kinds of practice" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HubCard href={`/grammar?level=${level}`} title="Grammar" blurb={`${pack ? plural(pack.content.grammarPoints.length, "topic") : "Topics"} at ${level}, with examples and common mistakes.`} />
        {PRACTICE_MODES.map((mode) => (
          <HubCard
            key={mode.id}
            href={`/practice/${mode.id}?level=${level}`}
            title={mode.title}
            blurb={mode.blurb}
            meta={mode.id === "flashcards" ? (due > 0 ? `${due} due today` : "Nothing due") : plural(counts.get(mode.id) ?? 0, "exercise")}
          />
        ))}
        <HubCard href="/sounds" title="Sounds" blurb="Every English sound with a mouth map." />
      </section>

      {pack?.source === "builtin" ? (
        <p className="px-2 text-xs text-slate-grey">Showing the starter set for {level}. The full lesson library downloads when it is published.</p>
      ) : null}
      {summary.recent.length > 0 ? (
        <section className="rounded-3xl bg-white px-5 py-6 sm:px-8">
          <h2 className="font-kicker text-xl text-hunter-green">Recent</h2>
          <ul className="mt-3 divide-y divide-platinum">
            {summary.recent.slice(0, 5).map((item) => (
              <li key={`${item.at}-${item.refId}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-hunter-green">{item.kind.replace("_", " ")} · {item.level ?? ""}</span>
                <span className="text-iron-grey">{item.score === null ? "" : `${item.score}%`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/10 px-3 py-3">
      <p className="text-3xl font-semibold">{value}</p>
      <p className="text-xs text-white/75">{label}</p>
    </div>
  );
}

function HubCard({ href, title, blurb, meta }: { href: string; title: string; blurb: string; meta?: string }) {
  return (
    <Link href={href} className="group flex min-h-36 flex-col justify-between rounded-3xl bg-white px-5 py-5 transition-colors hover:bg-yellow-green">
      <div>
        <h2 className="font-kicker text-2xl text-hunter-green">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-iron-grey">{blurb}</p>
      </div>
      {meta ? <p className="mt-3 text-xs font-semibold text-sage-green">{meta}</p> : null}
    </Link>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
