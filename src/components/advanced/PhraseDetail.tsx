// FILE: src/components/advanced/PhraseDetail.tsx
//
// One phrase: what it means and does, a natural example to hear and record
// (A/B against the target), the plain version to rephrase, a gap fill, and
// a rating that schedules its next review.
"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { buildPhraseDrill, gradeFromAnswer, gradeFromSelf, gradeGapFill, gradeRephrase, PHRASE_SITUATIONS, type Phrase } from "@/lib/platform/phrase-bank.ts";
import { mastery } from "@/lib/platform/srs.ts";
import { useAdvancedContent } from "./content";
import { RecordCompare } from "./RecordCompare";
import { addToList, gradeItem, removeFromList, useAdvancedState } from "./store";
import { AdvancedNav, Empty, Loading, RateRow, Surface, Tag } from "./ui";

const SITUATION_TITLES = Object.fromEntries(PHRASE_SITUATIONS.map((s) => [s.id, s.title]));
const KIND_TITLES = { chunk: "Chunk", collocation: "Collocation", frame: "Sentence frame" } as const;

export function PhraseDetail({ id }: { id: string }) {
  const content = useAdvancedContent();
  if (!content) return <Loading label="Loading the phrase" />;
  const phrase = content.phrases.find((p) => p.id === id);
  if (!phrase) return <Empty title="That phrase isn't in the bank">It may have come from a newer content update. <Link className="font-semibold text-hunter-green" href="/phrases">Back to the phrase bank</Link></Empty>;
  return <PhraseView phrase={phrase} audioUrl={content.audio[phrase.id] ?? null} />;
}

export function PhraseView({ phrase, audioUrl }: { phrase: Phrase; audioUrl: string | null }) {
  const state = useAdvancedState();
  const listed = state.list.some((i) => i.itemId === phrase.id);
  const stage = mastery(state.cards[phrase.id]);
  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <Link href="/phrases" className="px-1 text-sm font-semibold text-hunter-green">
        Phrase bank
      </Link>
      <header className="flex flex-col gap-3 px-1">
        <div className="flex flex-wrap gap-1">
          <Tag>{phrase.level}</Tag>
          <Tag>{KIND_TITLES[phrase.kind]}</Tag>
          {phrase.situations.map((s) => (
            <Tag key={s} tone="muted">
              {SITUATION_TITLES[s] ?? s}
            </Tag>
          ))}
        </div>
        <h1 className="text-balance text-3xl font-semibold text-carbon-black sm:text-4xl">{phrase.text}</h1>
        <p className="max-w-2xl text-lg leading-8 text-iron-grey">{phrase.meaning}</p>
      </header>

      <Surface className="flex flex-col gap-4">
        <p className="eyebrow text-sm text-slate-grey">Say it like this</p>
        <p className="text-xl leading-9 text-carbon-black">{highlight(phrase.example, phrase.form)}</p>
        <RecordCompare itemId={phrase.id} text={phrase.example} audioUrl={audioUrl} />
        {phrase.note ? <p className="text-sm leading-6 text-iron-grey">{phrase.note}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => (listed ? removeFromList([phrase.id]) : addToList([phrase.id]))}>
            {listed ? "On your practice list" : "Add to practice list"}
          </Button>
        </div>
      </Surface>

      <div className="grid gap-5 lg:grid-cols-2">
        <GapFill phrase={phrase} />
        <Rephrase phrase={phrase} />
      </div>

      <Surface className="flex flex-col gap-3">
        <p className="font-semibold text-carbon-black">How well do you own it?</p>
        <p className="text-sm text-iron-grey">{stage === "new" ? "Not reviewed yet." : `Review: ${stage}.`} Your rating sets when it comes back.</p>
        <RateRow onRate={(r) => gradeItem(phrase.id, gradeFromSelf(r))} />
      </Surface>
    </div>
  );
}

export function highlight(text: string, form: string) {
  const at = text.toLowerCase().indexOf(form.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold text-hunter-green">{text.slice(at, at + form.length)}</strong>
      {text.slice(at + form.length)}
    </>
  );
}

function GapFill({ phrase }: { phrase: Phrase }) {
  const drill = buildPhraseDrill(phrase, "gap_fill");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<null | boolean>(null);
  const [tries, setTries] = useState(0);
  if (drill.kind !== "gap_fill") return null;
  return (
    <Surface className="flex flex-col gap-3">
      <p className="font-semibold text-carbon-black">Gap fill</p>
      <p className="text-base leading-7 text-carbon-black">{drill.text}</p>
      <p className="text-sm text-slate-grey">{drill.hint}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const correct = gradeGapFill(phrase, answer);
          setResult(correct);
          setTries((t) => t + 1);
          if (correct) gradeItem(phrase.id, gradeFromAnswer(true, tries + 1));
        }}
      >
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="The missing phrase" className="min-h-12 flex-1 rounded-[14px] bg-platinum px-4 text-base text-carbon-black" />
        <Button type="submit">Check</Button>
      </form>
      {result === true ? <p className="text-sm font-semibold text-hunter-green">Right: {phrase.form}.</p> : result === false ? <p className="text-sm text-iron-grey">Not quite. {tries >= 2 ? `It's "${phrase.form}".` : "Try again."}</p> : null}
    </Surface>
  );
}

function Rephrase({ phrase }: { phrase: Phrase }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<null | boolean>(null);
  return (
    <Surface className="flex flex-col gap-3">
      <p className="font-semibold text-carbon-black">Rephrase</p>
      <p className="text-sm text-iron-grey">Say this again using “{phrase.text}”, out loud first, then type it.</p>
      <p className="text-base leading-7 text-carbon-black">{phrase.plain}</p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(gradeRephrase(phrase, answer));
        }}
      >
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} aria-label="Your version" className="rounded-[14px] bg-platinum px-4 py-3 text-base text-carbon-black" />
        <div>
          <Button type="submit">Check</Button>
        </div>
      </form>
      {result === true ? <p className="text-sm font-semibold text-hunter-green">That uses it. Compare with: {phrase.example}</p> : result === false ? <p className="text-sm text-iron-grey">The phrase isn&apos;t in there yet. One way: {phrase.example}</p> : null}
    </Surface>
  );
}
