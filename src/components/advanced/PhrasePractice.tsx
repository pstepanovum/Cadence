// FILE: src/components/advanced/PhrasePractice.tsx
//
// Today's phrase session: assigned items, reviews due and a few new phrases
// (buildPracticeDay), each through hear and repeat, gap fill, rephrase and
// shadowing, with a recording to compare at the spoken steps. The result
// schedules the item's next review.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { drillsForPhrase, gradeFromSelf, gradeGapFill, gradeRephrase, PHRASE_DRILL_TITLES, type Phrase, type PhraseDrill } from "@/lib/platform/phrase-bank.ts";
import { buildPracticeDay } from "@/lib/platform/practice-day.ts";
import type { Grade } from "@/lib/platform/srs.ts";
import { useAdvancedContent } from "./content";
import { highlight } from "./PhraseDetail";
import { RecordCompare } from "./RecordCompare";
import { gradeItem, readAdvanced, today } from "./store";
import { AdvancedNav, Empty, Loading, PageHead, RateRow, Surface, Tag } from "./ui";

export function PhrasePractice() {
  const content = useAdvancedContent();
  // The queue is fixed when the session starts, so grading never reshuffles it.
  const queue = useMemo(() => {
    if (!content) return null;
    const s = readAdvanced();
    const day = buildPracticeDay({ day: today(), phrases: content.phrases, slang: [], cards: s.cards, list: s.list.filter((i) => i.itemId.startsWith("phrase.")), track: null, catalog: [], limits: { fresh: 5, due: 12, assigned: 8 } });
    return day.items.map((i) => ({ phrase: content.phrases.find((p) => p.id === i.itemId)!, reason: i.reason })).filter((x) => x.phrase);
  }, [content]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [missed, setMissed] = useState(false);
  const [done, setDone] = useState<{ id: string; grade: Grade }[]>([]);

  if (!content || !queue) return <Loading label="Building today's session" />;
  if (queue.length === 0) return <Empty title="Nothing to practise right now">Every phrase you started is scheduled for later. Browse the bank to add new ones.</Empty>;
  if (index >= queue.length) {
    return (
      <div className="flex flex-col gap-5">
        <AdvancedNav />
        <PageHead eyebrow="Done for today" title={`${done.length} phrase${done.length === 1 ? "" : "s"} practised`}>
          {done.filter((d) => d.grade === "again").length} will come back tomorrow; the rest are scheduled further out.
        </PageHead>
        <div className="flex flex-wrap gap-2">
          <Button href="/phrases">Back to the phrase bank</Button>
          <Button variant="secondary" href="/recordings">
            Hear your recordings
          </Button>
        </div>
      </div>
    );
  }

  const { phrase, reason } = queue[index];
  const drills = drillsForPhrase(phrase);
  const drill = drills[step];
  const next = () => setStep((s) => s + 1);
  const finish = (grade: Grade) => {
    const final: Grade = missed && grade !== "again" ? "hard" : grade;
    gradeItem(phrase.id, final);
    setDone((d) => [...d, { id: phrase.id, grade: final }]);
    setIndex((i) => i + 1);
    setStep(0);
    setMissed(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-semibold text-slate-grey">
          Phrase {index + 1} of {queue.length}
        </p>
        <Tag tone={reason === "due" ? "green" : "grey"}>{reason === "due" ? "Review" : reason === "assigned" ? "Assigned" : "New"}</Tag>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-platinum" aria-hidden="true">
        <div className="h-full rounded-full bg-hunter-green transition-all" style={{ width: `${((index + step / (drills.length + 1)) / queue.length) * 100}%` }} />
      </div>
      <header className="flex flex-col gap-2 px-1">
        <h1 className="text-3xl font-semibold text-carbon-black">{phrase.text}</h1>
        <p className="text-base leading-7 text-iron-grey">{phrase.meaning}</p>
      </header>
      {drill ? <DrillCard key={`${phrase.id}-${step}`} phrase={phrase} drill={drill} audioUrl={content.audio[phrase.id] ?? null} onNext={next} onMiss={() => setMissed(true)} /> : (
        <Surface className="flex flex-col gap-3">
          <p className="font-semibold text-carbon-black">How did it go?</p>
          <p className="text-sm text-iron-grey">Be strict: “Clean” only if you could say it without the model.</p>
          <RateRow onRate={(r) => finish(gradeFromSelf(r))} />
        </Surface>
      )}
      <Link href="/phrases" className="px-1 text-sm font-semibold text-iron-grey">
        Stop for now
      </Link>
    </div>
  );
}

function DrillCard({ phrase, drill, audioUrl, onNext, onMiss }: { phrase: Phrase; drill: PhraseDrill; audioUrl: string | null; onNext: () => void; onMiss: () => void }) {
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState<null | boolean>(null);
  const title = PHRASE_DRILL_TITLES[drill.kind];
  return (
    <Surface className="flex flex-col gap-4">
      <div>
        <p className="eyebrow text-sm text-slate-grey">{title}</p>
        <p className="mt-1 text-sm text-iron-grey">{drill.instruction}</p>
      </div>
      {drill.kind === "listen_repeat" || drill.kind === "shadowing" ? (
        <>
          <p className="text-xl leading-9 text-carbon-black">{highlight(drill.say, phrase.form)}</p>
          <RecordCompare itemId={phrase.id} text={drill.say} audioUrl={audioUrl} />
          <div>
            <Button onClick={onNext}>Next</Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (checked !== null) return onNext();
            const ok = drill.kind === "gap_fill" ? gradeGapFill(phrase, answer) : gradeRephrase(phrase, answer);
            setChecked(ok);
            if (!ok) onMiss();
          }}
        >
          <p className="text-lg leading-8 text-carbon-black">{drill.kind === "gap_fill" ? drill.text : drill.plain}</p>
          <p className="text-sm text-slate-grey">{drill.hint}</p>
          {drill.kind === "gap_fill" ? (
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="The missing phrase" autoFocus className="min-h-12 rounded-[14px] bg-platinum px-4 text-base text-carbon-black" />
          ) : (
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} aria-label="Your version" autoFocus className="rounded-[14px] bg-platinum px-4 py-3 text-base text-carbon-black" />
          )}
          {checked === true ? <p className="text-sm font-semibold text-hunter-green">Right.{drill.kind === "rephrase" ? ` Model: ${phrase.example}` : ""}</p> : null}
          {checked === false ? <p className="text-sm text-iron-grey">{drill.kind === "gap_fill" ? `It's "${phrase.form}".` : `Model: ${phrase.example}`}</p> : null}
          <div>
            <Button type="submit">{checked === null ? "Check" : "Next"}</Button>
          </div>
        </form>
      )}
    </Surface>
  );
}
