// FILE: src/components/advanced/Slang.tsx
//
// Modern slang: the dictionary (by where it fits, region and category),
// one entry's page (meaning, register, fits, examples to hear and record,
// who says it, whether it sounds dated), and the quiz session (meaning,
// fit the context, choose the natural reply) with spaced review.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { buildSlangQuiz, gradeFromAnswer, gradeFromSelf, searchSlang, SLANG_FIT_LABELS, SLANG_FITS, SLANG_QUIZZES, SLANG_REGIONS, type SlangEntry, type SlangFit, type SlangRegion } from "@/lib/platform/phrase-bank.ts";
import { dailyNewOrder } from "@/lib/platform/phrase-bank.ts";
import { isDue, isNew } from "@/lib/platform/srs.ts";
import { cn } from "@/lib/utils";
import { useAdvancedContent } from "./content";
import { RecordCompare } from "./RecordCompare";
import { gradeItem, readAdvanced, today, useAdvancedState } from "./store";
import { AdvancedNav, Chip, Empty, Loading, PageHead, RateRow, RowLink, Surface, Tag } from "./ui";

const REGION_LABELS: Record<SlangRegion, string> = { US: "American", UK: "British", global: "Everywhere" };

export function SlangDictionary() {
  const content = useAdvancedContent();
  const state = useAdvancedState();
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState<SlangFit | null>(null);
  const [region, setRegion] = useState<SlangRegion | null>(null);
  const [category, setCategory] = useState("");
  const [hideDated, setHideDated] = useState(false);
  const results = useMemo(() => (content ? searchSlang(content.slang, { query, fit: fit ?? undefined, region: region ?? undefined, category: category || undefined, includeDated: !hideDated, limit: 10_000 }) : []), [content, query, fit, region, category, hideDated]);
  const now = new Date();
  const due = content?.slang.filter((e) => isDue(state.cards[e.id], now)).length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <PageHead eyebrow="Modern slang" title="The English nobody taught you" actions={<Button href="/slang/quiz">{due ? `Quiz · ${due} due` : "Take today's quiz"}</Button>}>
        What people actually say in messages, with friends and in a relaxed office: what it means, where it fits, who says it, and which words now sound a few years old.
      </PageHead>
      <Surface className="flex flex-col gap-4">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a word or a meaning" aria-label="Search slang" className="min-h-12 rounded-[14px] bg-platinum px-4 text-base text-carbon-black placeholder:text-slate-grey" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Where it fits">
          <Chip selected={fit === null} onClick={() => setFit(null)}>Anywhere</Chip>
          {SLANG_FITS.map((f) => (
            <Chip key={f} selected={fit === f} onClick={() => setFit(f)}>
              {SLANG_FIT_LABELS[f]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Region">
          <Chip selected={region === null} onClick={() => setRegion(null)}>Every region</Chip>
          {SLANG_REGIONS.filter((r) => r !== "global").map((r) => (
            <Chip key={r} selected={region === r} onClick={() => setRegion(r)}>
              {REGION_LABELS[r]}
            </Chip>
          ))}
          <Chip selected={hideDated} onClick={() => setHideDated((v) => !v)}>Current only</Chip>
        </div>
        {content?.slangCategories.length ? (
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="min-h-12 rounded-[14px] bg-platinum px-4 text-base text-carbon-black sm:max-w-sm">
            <option value="">Every category</option>
            {content.slangCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        ) : null}
      </Surface>
      {!content ? (
        <Loading label="Loading slang" />
      ) : results.length === 0 ? (
        <Empty title={content.slang.length ? "Nothing matches" : "The slang guide isn't on this server yet"}>{content.slang.length ? "Try another word or clear a filter." : "It arrives with the next content update."}</Empty>
      ) : (
        <Surface className="flex flex-col gap-1 p-2 sm:p-3">
          <p className="px-4 py-2 text-sm text-slate-grey">{results.length} entries</p>
          {results.map((e) => (
            <RowLink key={e.id} href={`/slang/${encodeURIComponent(e.id)}`} title={e.term} detail={e.meaning} meta={<>{e.dated ? <Tag tone="muted">Dated</Tag> : null}{e.fits.includes("avoid-at-work") ? <Tag>Not at work</Tag> : null}{isDue(state.cards[e.id], now) ? <Tag tone="green">Due</Tag> : null}</>} />
          ))}
        </Surface>
      )}
    </div>
  );
}

export function SlangDetail({ id }: { id: string }) {
  const content = useAdvancedContent();
  const [quizKind, setQuizKind] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  if (!content) return <Loading label="Loading" />;
  const entry = content.slang.find((e) => e.id === id);
  if (!entry) return <Empty title="That entry isn't in the guide"><Link className="font-semibold text-hunter-green" href="/slang">Back to slang</Link></Empty>;
  const quiz = buildSlangQuiz(entry, SLANG_QUIZZES[quizKind % 3], content.slang, today());
  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <Link href="/slang" className="px-1 text-sm font-semibold text-hunter-green">
        Slang
      </Link>
      <header className="flex flex-col gap-3 px-1">
        <div className="flex flex-wrap gap-1">
          <Tag>{entry.partOfSpeech}</Tag>
          <Tag>{entry.register === "very-informal" ? "Very informal" : "Informal"}</Tag>
          <Tag>{REGION_LABELS[entry.region]}</Tag>
          {entry.dated ? <Tag tone="muted">Sounds dated</Tag> : null}
        </div>
        <h1 className="text-3xl font-semibold text-carbon-black sm:text-4xl">{entry.term}</h1>
        <p className="max-w-2xl text-lg leading-8 text-iron-grey">{entry.meaning}</p>
      </header>
      <Surface className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" aria-label="Where it fits">
          {SLANG_FITS.map((f) => (
            <span key={f} className={cn("rounded-[10px] px-3 py-1.5 text-sm font-semibold", entry.fits.includes(f) ? (f === "avoid-at-work" ? "bg-carbon-black text-white" : "bg-hunter-green text-white") : "bg-platinum text-slate-grey line-through")}>
              {SLANG_FIT_LABELS[f]}
            </span>
          ))}
        </div>
        <p className="text-sm leading-6 text-iron-grey">{entry.usageNote}</p>
        {entry.dated && entry.datedNote ? <p className="text-sm leading-6 text-iron-grey">Dated: {entry.datedNote}</p> : null}
      </Surface>
      <Surface className="flex flex-col gap-4">
        <p className="eyebrow text-sm text-slate-grey">In use</p>
        {entry.examples.map((example, i) => (
          <div key={example} className="flex flex-col gap-2">
            <p className="text-lg leading-8 text-carbon-black">{example}</p>
            <RecordCompare itemId={entry.id} text={example} audioUrl={i === 0 ? (content.audio[entry.id] ?? null) : null} compact={i > 0} />
          </div>
        ))}
      </Surface>
      <Surface className="flex flex-col gap-3">
        <p className="font-semibold text-carbon-black">{quiz.question}</p>
        <QuizOptions options={quiz.options} answer={quiz.answer} picked={picked} onPick={(i) => {
          if (picked !== null) return;
          setPicked(i);
          gradeItem(entry.id, gradeFromAnswer(i === quiz.answer));
        }} />
        {picked !== null ? (
          <div>
            <Button variant="secondary" onClick={() => { setPicked(null); setQuizKind((k) => k + 1); }}>
              Another question
            </Button>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}

function QuizOptions({ options, answer, picked, onPick }: { options: string[]; answer: number; picked: number | null; onPick: (i: number) => void }) {
  return (
    <div className="flex flex-col gap-2" role="group">
      {options.map((option, i) => {
        const state = picked === null ? "idle" : i === answer ? "right" : i === picked ? "wrong" : "idle";
        return (
          <button
            key={option}
            type="button"
            onClick={() => onPick(i)}
            aria-pressed={picked === i}
            className={cn("min-h-12 rounded-[14px] px-4 py-3 text-left text-base transition-colors", state === "right" ? "bg-yellow-green text-carbon-black" : state === "wrong" ? "bg-alabaster-grey text-slate-grey line-through" : "bg-platinum text-carbon-black hover:bg-alabaster-grey")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function SlangQuiz() {
  const content = useAdvancedContent();
  const queue = useMemo(() => {
    if (!content) return null;
    const s = readAdvanced();
    const now = new Date();
    const due = content.slang.filter((e) => isDue(s.cards[e.id], now));
    const fresh = dailyNewOrder(content.slang.filter((e) => isNew(s.cards[e.id]) && !e.dated).map((e) => e.id), today()).slice(0, Math.max(0, 10 - due.length));
    return [...due.slice(0, 15), ...fresh.map((id) => content.slang.find((e) => e.id === id)!)];
  }, [content]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  if (!content || !queue) return <Loading label="Building the quiz" />;
  if (queue.length === 0) return <Empty title="Nothing to quiz right now">Everything you have seen is scheduled for later.</Empty>;
  if (index >= queue.length) {
    return (
      <div className="flex flex-col gap-5">
        <AdvancedNav />
        <PageHead eyebrow="Quiz done" title={`${score} of ${queue.length} right`}>Misses come back tomorrow.</PageHead>
        <div>
          <Button href="/slang">Back to slang</Button>
        </div>
      </div>
    );
  }
  const entry: SlangEntry = queue[index];
  const quiz = buildSlangQuiz(entry, SLANG_QUIZZES[index % 3], content.slang, today());
  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <p className="px-1 text-sm font-semibold text-slate-grey">
        {index + 1} of {queue.length}
      </p>
      <Surface className="flex flex-col gap-4">
        <p className="eyebrow text-sm text-slate-grey">{quiz.kind === "meaning" ? "Meaning" : quiz.kind === "context" ? "Fit the context" : "The natural reply"}</p>
        <p className="text-xl font-semibold leading-8 text-carbon-black">{quiz.question}</p>
        <QuizOptions options={quiz.options} answer={quiz.answer} picked={picked} onPick={(i) => {
          if (picked !== null) return;
          setPicked(i);
          if (i === quiz.answer) setScore((s) => s + 1);
        }} />
        {picked !== null ? (
          <>
            <p className="text-sm leading-6 text-iron-grey">
              <strong className="text-carbon-black">{entry.term}</strong>: {entry.meaning} {entry.usageNote}
            </p>
            <RecordCompare itemId={entry.id} text={entry.examples[0]} audioUrl={content.audio[entry.id] ?? null} compact />
            <RateRow
              onRate={(r) => {
                gradeItem(entry.id, picked === quiz.answer ? gradeFromSelf(r) : "again");
                setPicked(null);
                setIndex((i) => i + 1);
              }}
            />
          </>
        ) : null}
      </Surface>
    </div>
  );
}
