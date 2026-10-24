// FILE: src/components/learn-hub/FlashcardDeck.tsx
//
// Spaced-repetition review on this device: due cards first, then a few new
// ones; each grade schedules the card's next day. Cards added through the MCP
// connector (sync.ts) join the deck at every level.
"use client";

import { useEffect, useRef, useState } from "react";
import { logActivity, loadCardStates, saveCardState } from "@/components/learn-hub/progress";
import { buildQueue, review, type CardState, type Grade } from "@/components/learn-hub/srs";
import { loadCustomCards } from "@/components/learn-hub/sync";
import { speakWord } from "@/components/mouth-map/speak";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CefrLevel, FlashcardExercise } from "@/lib/platform/content-model.ts";

type DeckCard = { id: string; front: string; back: string; example?: string };

export function FlashcardDeck({ cards: packCards, level }: { cards: FlashcardExercise[]; level: CefrLevel }) {
  // Mounted only after the pack has loaded in the browser, so storage is readable here.
  const [cards] = useState<DeckCard[]>(() => [
    ...packCards.map((c) => ({ id: c.id, front: c.front, back: c.back, example: c.example?.text })),
    ...loadCustomCards().map((c) => ({ id: c.id, front: c.front, back: c.back, example: c.example })),
  ]);
  const [states] = useState<Record<string, CardState>>(() => loadCardStates());
  const [queue] = useState(() => buildQueue(cards.map((c) => c.id), states, new Date()));
  const [position, setPosition] = useState(0);
  const [shown, setShown] = useState(false);
  const [recalled, setRecalled] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
  }, []);
  const logged = useRef(false);
  const done = position >= queue.length;

  useEffect(() => {
    if (!done || logged.current || queue.length === 0) return;
    logged.current = true;
    logActivity({
      kind: "flashcards",
      refId: `deck.${level.toLowerCase()}`,
      level,
      score: Math.round((recalled / queue.length) * 100),
      minutes: Math.max(1, (Date.now() - started.current) / 60000),
    });
  }, [done, level, queue.length, recalled]);

  if (queue.length === 0) {
    return (
      <EmptyState title="No cards due" action={{ label: "Start a quiz", href: `/practice/quiz?level=${level}` }} illustration="/illustration/success-1.svg">
        You are up to date at {level}. Cards come back on the day they are due.
      </EmptyState>
    );
  }

  if (done) {
    return (
      <EmptyState title="Deck done for today" action={{ label: "Practise sentences", href: `/practice/sentences?level=${level}` }} illustration="/illustration/success-1.svg">
        You recalled {recalled} of {queue.length}. Come back tomorrow for the next ones.
      </EmptyState>
    );
  }

  const card = cards.find((c) => c.id === queue[position])!;

  function grade(value: Grade) {
    const next = review(states[card.id], value, new Date());
    saveCardState(card.id, next);
    if (value !== "again") setRecalled((r) => r + 1);
    setShown(false);
    setPosition((p) => p + 1);
  }

  return (
    <article className="space-y-5 rounded-3xl bg-white px-5 py-8 text-center sm:px-10" aria-live="polite">
      <p className="text-sm text-iron-grey">Card {position + 1} of {queue.length}</p>
      <p className="text-4xl font-semibold text-hunter-green">{card.front}</p>
      <button type="button" onClick={() => speakWord(card.front)} className="min-h-11 cursor-pointer text-sm font-semibold text-sage-text underline underline-offset-2">
        Hear it
      </button>
      {shown ? (
        <div className="space-y-2">
          <p className="text-xl text-iron-grey">{card.back}</p>
          {card.example ? <p className="italic text-iron-grey">{card.example}</p> : null}
        </div>
      ) : null}
      {!shown ? (
        <Button onClick={() => setShown(true)} autoFocus>Show answer</Button>
      ) : (
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="ghost" onClick={() => grade("again")}>Again</Button>
          <Button variant="secondary" onClick={() => grade("hard")}>Hard</Button>
          <Button variant="secondary" onClick={() => grade("good")}>Good</Button>
          <Button variant="secondary" onClick={() => grade("easy")}>Easy</Button>
        </div>
      )}
    </article>
  );
}
