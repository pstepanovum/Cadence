// FILE: src/components/learn-hub/PracticeSession.tsx
//
// One round of a practice mode at a level: picks the exercises from the pack,
// plays them, and logs the round (local summary, plus sync when signed in).
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExerciseCard } from "@/components/learn-hub/ExerciseCard";
import { FlashcardDeck } from "@/components/learn-hub/FlashcardDeck";
import { LevelPicker, useLevel } from "@/components/learn-hub/LevelPicker";
import { modeById } from "@/components/learn-hub/modes";
import { usePack } from "@/components/learn-hub/packs";
import { logActivity } from "@/components/learn-hub/progress";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CefrLevel, Exercise, GradeResult } from "@/lib/platform/content-model.ts";
import type { ActivityKind } from "@/lib/platform/progress-model.ts";

function pick(exercises: Exercise[], size: number): Exercise[] {
  const copy = [...exercises];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, size);
}

export function PracticeSession({ modeId, initialLevel, grammarPointId }: { modeId: string; initialLevel: CefrLevel | null; grammarPointId: string | null }) {
  const mode = modeById(modeId)!;
  const [level, setLevel] = useLevel(initialLevel);
  const pack = usePack(level);
  const [round, setRound] = useState(0);

  const exercises = useMemo(() => {
    if (!pack) return null;
    const pool = pack.content.exercises.filter(
      (e) => mode.kinds.includes(e.kind) && (!grammarPointId || e.grammarPointIds.includes(grammarPointId)),
    );
    return mode.id === "flashcards" ? pool : pick(pool, mode.size);
    // A new round reshuffles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, mode, grammarPointId, round]);

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-[20px] bg-white px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="eyebrow text-sm text-slate-grey">
            <Link href={`/practice?level=${level}`} className="underline-offset-2 hover:underline">Practice</Link> · {level}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-carbon-black">{mode.title}</h1>
          <p className="mt-1 text-sm text-iron-grey">{mode.blurb}</p>
        </div>
        <LevelPicker level={level} onChange={(next) => { setLevel(next); setRound((r) => r + 1); }} />
      </section>

      {exercises === null ? (
        <p className="rounded-[20px] bg-white px-6 py-10 text-center text-iron-grey" role="status">Loading…</p>
      ) : exercises.length === 0 ? (
        <EmptyState
          title="Nothing here at this level yet"
          action={{ label: "Try the quiz instead", href: `/practice/quiz?level=${level}` }}
        >
          New exercises arrive with content updates. Pick another level or another kind of practice.
        </EmptyState>
      ) : mode.id === "flashcards" ? (
        <FlashcardDeck key={`${level}-${round}`} cards={exercises.filter((e): e is Extract<Exercise, { kind: "flashcard" }> => e.kind === "flashcard")} level={level} />
      ) : (
        <Round key={`${level}-${round}`} exercises={exercises} level={level} modeId={mode.id} activity={mode.activity} onAgain={() => setRound((r) => r + 1)} />
      )}
    </div>
  );
}

function Round({ exercises, level, modeId, activity, onAgain }: { exercises: Exercise[]; level: CefrLevel; modeId: string; activity: ActivityKind; onAgain: () => void }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<GradeResult[]>([]);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const done = index >= exercises.length;
  const score = results.length ? Math.round((results.reduce((sum, r) => sum + r.score, 0) / results.length) * 100) : 0;
  const logged = useRef(false);

  useEffect(() => {
    if (!done || logged.current) return;
    logged.current = true;
    logActivity({
      kind: activity,
      refId: `set.${level.toLowerCase()}.${modeId}`,
      level,
      score,
      minutes: Math.max(1, (Date.now() - started.current) / 60000),
    });
  }, [done, activity, level, modeId, score]);

  if (done) {
    return (
      <section className="space-y-4 rounded-[20px] bg-white px-6 py-8 text-carbon-black sm:px-10" aria-live="polite">
        <p className="eyebrow text-sm text-slate-grey">Round done</p>
        <p className="text-5xl font-semibold">{score}%</p>
        <p className="text-base text-iron-grey">
          {results.filter((r) => r.correct).length} of {results.length} right.{" "}
          {score >= 80 ? "Strong. Try the next level up or a harder mode." : "Another round shuffles new questions."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onAgain}>Another round</Button>
          <Button href={`/practice?level=${level}`} variant="secondary">Back to practice</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1" aria-label={`Question ${index + 1} of ${exercises.length}`}>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-platinum">
          <div className="h-full rounded-full bg-sage-green transition-[width]" style={{ width: `${(index / exercises.length) * 100}%` }} />
        </div>
        <span className="text-sm text-iron-grey">{index + 1}/{exercises.length}</span>
      </div>
      <ExerciseCard
        key={exercises[index].id}
        exercise={exercises[index]}
        isLast={index === exercises.length - 1}
        onResult={(result) => setResults((r) => [...r, result])}
        onNext={() => setIndex((i) => i + 1)}
      />
    </div>
  );
}
