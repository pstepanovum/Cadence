// FILE: src/components/levels/PlacementTest.tsx
//
// The adaptive placement test on the web (docs/PLATFORM.md section 7): items
// from the `placement` pack, starting at B2 and moving up or down with each
// answer until the estimate is sure (12 to 24 items). Graded in the browser,
// no right-or-wrong shown. Items seen in earlier tests are kept back while
// fresh ones remain. The result becomes the learner's level at once.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExerciseCard } from "@/components/learn-hub/ExerciseCard";
import { loadPlacementContent } from "@/components/learn-hub/packs";
import { applyPlacement, readSeen, rememberSeen } from "@/components/levels/level-store";
import { Button } from "@/components/ui/button";
import type { CefrLevel, Exercise, PackContent } from "@/lib/platform/content-model.ts";
import { LEVEL_INFO, examLine } from "@/lib/platform/levels.ts";
import {
  ADAPTIVE,
  adaptiveResult,
  bankFromExercises,
  decodeSeen,
  nextPlacementItem,
  placementDone,
  type AdaptiveResponse,
  type AdaptiveResult,
} from "@/lib/platform/placement.ts";

const CONFIDENCE_TEXT = { high: "A clear result.", medium: "A fairly clear result.", low: "A rough result: retake it any time." } as const;

export function PlacementTest({ signedIn }: { signedIn: boolean }) {
  const [content, setContent] = useState<PackContent | null | undefined>(undefined);
  const [responses, setResponses] = useState<AdaptiveResponse[]>([]);
  const [result, setResult] = useState<AdaptiveResult | null>(null);
  // Read on the client only; the server never picks an item (no pack there).
  const [seen, setSeen] = useState<Set<string>>(() => new Set(typeof window === "undefined" ? [] : decodeSeen(readSeen())));
  const pending = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void loadPlacementContent().then((loaded) => live && setContent(loaded));
    return () => {
      live = false;
    };
  }, []);

  const bank = useMemo(() => bankFromExercises(content?.exercises ?? []), [content]);
  const byId = useMemo(() => new Map<string, Exercise>((content?.exercises ?? []).map((e) => [e.id, e])), [content]);
  const item = useMemo(() => (result || bank.length === 0 ? null : nextPlacementItem(bank, responses, seen, Math.random)), [bank, responses, seen, result]);
  const exercise = item ? byId.get(item.id) ?? null : null;

  if (content === undefined) return <p className="text-sm text-iron-grey">Getting the test ready…</p>;
  if (!content || bank.length === 0) return <p className="text-sm text-iron-grey">The placement test is not available on this server yet.</p>;
  if (result) return <PlacementResult result={result} onRetake={() => {
    setSeen(new Set(decodeSeen(readSeen())));
    setResponses([]);
    setResult(null);
  }} />;
  if (!item || !exercise) return null;

  function answer(score: number) {
    if (!item) return;
    const next = [...responses, { ...item, score }];
    if (placementDone(next) || !nextPlacementItem(bank, next, seen, () => 0)) {
      const outcome = adaptiveResult(next);
      rememberSeen(next.map((r) => r.id), signedIn);
      applyPlacement(outcome.level, outcome.skills, signedIn);
      setResult(outcome);
    }
    setResponses(next);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-iron-grey">{`Question ${responses.length + 1} · ${ADAPTIVE.minItems} to ${ADAPTIVE.maxItems} in all`}</p>
      <ExerciseCard
        key={exercise.id}
        exercise={exercise}
        quiet
        isLast={false}
        onResult={(graded) => {
          pending.current = graded.score;
        }}
        onNext={() => answer(pending.current ?? 0)}
      />
      <button type="button" onClick={() => answer(0)} className="min-h-11 px-1 text-sm font-semibold text-sage-text underline underline-offset-2">
        I don&apos;t know
      </button>
    </div>
  );
}

function PlacementResult({ result, onRetake }: { result: AdaptiveResult; onRetake: () => void }) {
  const level: CefrLevel = result.level;
  const skills = (Object.entries(result.skills) as [string, CefrLevel][]).filter(([, value]) => value !== level);
  return (
    <div className="space-y-2 rounded-3xl bg-platinum px-6 py-6" role="status">
      <p className="text-sm text-iron-grey">Your level</p>
      <p className="font-kicker text-5xl text-hunter-green">{level}</p>
      <p className="font-semibold text-hunter-green">{LEVEL_INFO[level].name}</p>
      <p className="text-sm text-iron-grey">{examLine(level)}</p>
      <p className="text-sm">{`${CONFIDENCE_TEXT[result.confidence]} ${result.asked} questions, ${result.score}% right.`}</p>
      {skills.map(([skill, value]) => (
        <p key={skill} className="text-sm">{`${skill === "grammar" ? "Grammar" : "Vocabulary"}: ${value}`}</p>
      ))}
      <p className="text-sm">Practice, the grammar browser and the coach now start here.</p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button href="/practice">Start practising</Button>
        <Button variant="secondary" onClick={onRetake}>
          Take it again
        </Button>
      </div>
    </div>
  );
}
