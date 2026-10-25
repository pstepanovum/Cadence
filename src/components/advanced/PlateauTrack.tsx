// FILE: src/components/advanced/PlateauTrack.tsx
//
// The plateau track (docs/PLATFORM.md section 18): a short diagnostic, then
// a 12-week program on the learner's persistent errors with daily drills,
// a re-test at the end of every week, and progress per error. Evidence also
// comes from the pronunciation scores this browser has kept.
"use client";

import { useState } from "react";

import { loadSoundStore } from "@/components/mouth-map/sound-store";
import { Button } from "@/components/ui/button";
import {
  addOwnSentence,
  dailyDrills,
  diagnose,
  diagnosticItems,
  DRILL_STEP_TITLES,
  errorProgress,
  evidenceFromPhonemes,
  gradeCorrection,
  PHASE_COPY,
  recordRetest,
  retestItems,
  startTrack,
  trackSummary,
  type DiagnosticItem,
  type Evidence,
  type FossilError,
  type Track,
} from "@/lib/platform/fossilization.ts";
import { gradeFromSelf } from "@/lib/platform/phrase-bank.ts";
import { cn } from "@/lib/utils";
import { useAdvancedContent } from "./content";
import { RecordCompare } from "./RecordCompare";
import { gradeDrillStep, setTrack, today, useAdvancedState, writeAdvanced } from "./store";
import { AdvancedNav, Empty, Loading, PageHead, RateRow, Surface, Tag } from "./ui";

/** Pronunciation scores this browser kept, as evidence, one point per sound per day. */
function soundEvidence(catalog: readonly FossilError[]): Evidence[] {
  const out: Evidence[] = [];
  try {
    for (const [soundId, record] of Object.entries(loadSoundStore())) for (const h of record.history ?? []) out.push(...evidenceFromPhonemes([{ soundId, score: h.score }], catalog, h.day));
  } catch {
    // No records yet.
  }
  return out;
}

export function PlateauTrack() {
  const content = useAdvancedContent();
  const state = useAdvancedState();
  const [mode, setMode] = useState<"home" | "diagnostic" | "retest">("home");
  if (!content) return <Loading label="Loading the plateau track" />;
  if (content.errors.length === 0) return <Empty title="The plateau track isn't on this server yet">It arrives with the next content update.</Empty>;
  const catalog = content.errors;
  const track = state.track;

  if (mode === "diagnostic") {
    return (
      <Probe
        title="Diagnostic"
        intro="About forty short items: correct each sentence, and read the spoken ones aloud and rate yourself honestly. Ten to fifteen minutes."
        items={diagnosticItems(catalog)}
        catalog={catalog}
        onDone={(evidence) => {
          const all = [...evidence, ...soundEvidence(catalog)];
          setTrack(startTrack(diagnose(all), today(), { now: Date.now() }));
          setMode("home");
        }}
        onCancel={() => setMode("home")}
      />
    );
  }
  if (mode === "retest" && track) {
    const week = trackSummary(track, today()).retestDue ?? 1;
    return (
      <Probe
        title={`Week ${week} re-test`}
        intro="One fresh item for each error you are working on."
        items={retestItems(track, catalog, week)}
        catalog={catalog}
        onDone={(evidence) => {
          const scores: Record<string, number> = {};
          for (const errorId of track.focus) {
            const mine = evidence.filter((e) => e.errorId === errorId);
            if (mine.length) scores[errorId] = Math.round((mine.filter((e) => e.ok).length / mine.length) * 100);
          }
          writeAdvanced((s) => (s.track ? { ...s, track: recordRetest(s.track, week, today(), scores, Date.now()) } : s));
          setMode("home");
        }}
        onCancel={() => setMode("home")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      {track ? <TrackHome track={track} catalog={catalog} onRetest={() => setMode("retest")} onRestart={() => setMode("diagnostic")} /> : <Intro onStart={() => setMode("diagnostic")} />}
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <PageHead eyebrow="Plateau track" title="Break the plateau in twelve weeks" actions={<Button onClick={onStart}>Take the diagnostic</Button>}>
        At C1 and above, the errors that remain are the ones nobody corrects any more, so they set. This program finds the ones that persist in your speech, works on two at a time with short daily drills, and re-tests them every week until they hold.
      </PageHead>
      <div className="grid gap-4 sm:grid-cols-3">
        {(["notice", "rebuild", "automate"] as const).map((phase, i) => (
          <Surface key={phase} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-slate-grey">Weeks {i === 0 ? "1 to 2" : i === 1 ? "3 to 8" : "9 to 12"}</p>
            <p className="text-lg font-semibold text-carbon-black">{PHASE_COPY[phase].title}</p>
            <p className="text-sm leading-6 text-iron-grey">{PHASE_COPY[phase].detail}</p>
          </Surface>
        ))}
      </div>
    </>
  );
}

function TrackHome({ track, catalog, onRetest, onRestart }: { track: Track; catalog: FossilError[]; onRetest: () => void; onRestart: () => void }) {
  const day = today();
  const summary = trackSummary(track, day);
  const steps = dailyDrills(track, catalog, day, { minutes: 10 });
  const progress = errorProgress(track);
  const title = (id: string | null) => catalog.find((e) => e.id === id)?.title ?? "Your own sentence";
  const [own, setOwn] = useState({ text: "", said: "" });

  return (
    <>
      <PageHead
        eyebrow={summary.phase === "done" ? "Plateau track · finished" : `Plateau track · week ${summary.week} of ${summary.weeks}`}
        title={PHASE_COPY[summary.phase].title}
        actions={summary.retestDue ? <Button onClick={onRetest}>Take the week {summary.retestDue} re-test</Button> : summary.phase === "done" ? <Button onClick={onRestart}>Start a new round</Button> : null}
      >
        {PHASE_COPY[summary.phase].detail}
        {summary.nextRetestDay && !summary.retestDue ? <span className="mt-1 block text-sm text-slate-grey">Next re-test {new Date(`${summary.nextRetestDay}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.</span> : null}
      </PageHead>

      {track.focus.length === 0 ? (
        <Empty title="No persistent error showed up">The diagnostic found nothing that repeats. Speak with the coach for a week and come back: spoken feedback is better evidence than any test.</Empty>
      ) : null}

      {steps.length > 0 ? (
        <Surface className="flex flex-col gap-4">
          <div>
            <p className="font-semibold text-carbon-black">Today&apos;s drills</p>
            <p className="text-sm text-iron-grey">{steps.length} steps, about ten minutes. Hear the target, record yourself, compare, then rate it.</p>
          </div>
          {steps.slice(0, 1).map((step) => (
            <div key={step.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                <Tag>{DRILL_STEP_TITLES[step.kind]}</Tag>
                <Tag tone="muted">{title(step.errorId)}</Tag>
              </div>
              {step.kind === "contrast" && step.alt ? <p className="text-base text-slate-grey line-through">{step.alt}</p> : null}
              <p className="text-xl leading-9 text-carbon-black">{step.kind === "stress" && step.alt ? step.alt : step.text}</p>
              {step.kind === "minimal_pair" && step.alt ? <p className="text-sm text-iron-grey">Against: {step.alt}. Say both, slowly, then quickly.</p> : null}
              {step.note ? <p className="text-sm text-iron-grey">{step.note}</p> : null}
              <p className="text-sm text-slate-grey">Say it {step.reps} times.</p>
              <RecordCompare itemId={step.id} text={step.kind === "minimal_pair" && step.alt ? `${step.text}. ${step.alt}.` : step.text} />
              <RateRow onRate={(r) => gradeDrillStep(step.id, gradeFromSelf(r))} />
            </div>
          ))}
          {steps.length > 1 ? <p className="text-sm text-slate-grey">Then {steps.length - 1} more.</p> : null}
        </Surface>
      ) : summary.phase !== "done" && track.focus.length ? (
        <Empty title="Done for today">Today&apos;s drills are finished. The ones you rated again come back tomorrow.</Empty>
      ) : null}

      {progress.length ? (
        <Surface className="flex flex-col gap-4">
          <p className="font-semibold text-carbon-black">Progress per error</p>
          {progress.map((p) => (
            <div key={p.errorId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-carbon-black">{title(p.errorId)}</span>
                <span className="flex gap-1">
                  {summary.activeErrors.includes(p.errorId) ? <Tag tone="green">This week</Tag> : null}
                  <Tag tone={p.status === "fixed" ? "green" : "muted"}>{p.status === "fixed" ? "Fixed" : p.status === "improving" ? "Improving" : "Persistent"}</Tag>
                </span>
              </div>
              <div className="flex items-end gap-1" aria-label={`Baseline ${p.baseline}, latest ${p.latest ?? "none yet"}`}>
                {[{ week: 0, score: p.baseline }, ...p.history].map((h) => (
                  <div key={h.week} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-16 w-full items-end rounded-[8px] bg-platinum">
                      <div className={cn("w-full rounded-[8px]", h.week === 0 ? "bg-pale-slate" : "bg-hunter-green")} style={{ height: `${Math.max(6, h.score)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-grey">{h.week === 0 ? "Start" : `W${h.week}`}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Surface>
      ) : null}

      <Surface className="flex flex-col gap-3">
        <p className="font-semibold text-carbon-black">Add a sentence from your own speech</p>
        <p className="text-sm text-iron-grey">When feedback corrects something you actually said, put the corrected version here. Your own sentences are the strongest drills.</p>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!own.text.trim()) return;
            writeAdvanced((s) => (s.track ? { ...s, track: addOwnSentence(s.track, { text: own.text, said: own.said || undefined }, today(), Date.now()) } : s));
            setOwn({ text: "", said: "" });
          }}
        >
          <input value={own.said} onChange={(e) => setOwn((o) => ({ ...o, said: e.target.value }))} placeholder="What you said (optional)" aria-label="What you said" className="min-h-12 rounded-[14px] bg-platinum px-4 text-base text-carbon-black placeholder:text-slate-grey" />
          <input value={own.text} onChange={(e) => setOwn((o) => ({ ...o, text: e.target.value }))} placeholder="The corrected sentence" aria-label="The corrected sentence" className="min-h-12 rounded-[14px] bg-platinum px-4 text-base text-carbon-black placeholder:text-slate-grey" />
          <div>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </div>
        </form>
        {track.ownSentences.length ? <p className="text-sm text-slate-grey">{track.ownSentences.length} of your own sentences in the drills.</p> : null}
      </Surface>
    </>
  );
}

function Probe({ title, intro, items, catalog, onDone, onCancel }: { title: string; intro: string; items: DiagnosticItem[]; catalog: FossilError[]; onDone: (evidence: Evidence[]) => void; onCancel: () => void }) {
  const [index, setIndex] = useState(0);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState<null | boolean>(null);
  const item = items[index];
  const day = today();
  const record = (ok: boolean) => {
    const next = [...evidence, { errorId: item.errorId, day, source: title === "Diagnostic" ? ("diagnostic" as const) : ("retest" as const), ok }];
    setEvidence(next);
    setAnswer("");
    setChecked(null);
    if (index + 1 >= items.length) onDone(next);
    else setIndex(index + 1);
  };
  if (!item) return <Empty title="Nothing to test">There are no items for this yet.</Empty>;
  const error = catalog.find((e) => e.id === item.errorId);

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <PageHead eyebrow={`${title} · ${index + 1} of ${items.length}`} title={item.kind === "correct" ? "Correct the sentence" : "Read it aloud"}>
        {index === 0 ? intro : item.kind === "correct" ? "Change only what is wrong. Some sentences need only one word changed." : "Record it once, listen back against the target, and rate yourself strictly."}
      </PageHead>
      <div className="h-1.5 overflow-hidden rounded-full bg-platinum" aria-hidden="true">
        <div className="h-full rounded-full bg-hunter-green" style={{ width: `${(index / items.length) * 100}%` }} />
      </div>
      <Surface className="flex flex-col gap-4">
        <p className="text-xl leading-9 text-carbon-black">{item.sentence}</p>
        {item.kind === "correct" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (checked !== null) return record(checked);
              setChecked(gradeCorrection(item.answers, answer));
            }}
          >
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} aria-label="The corrected sentence" autoFocus className="rounded-[14px] bg-platinum px-4 py-3 text-base text-carbon-black" />
            {checked === true ? <p className="text-sm font-semibold text-hunter-green">Right.</p> : null}
            {checked === false ? <p className="text-sm text-iron-grey">One correct version: {item.answers[0]}{error ? ` (${error.title})` : ""}</p> : null}
            <div className="flex gap-2">
              <Button type="submit">{checked === null ? "Check" : "Next"}</Button>
              {checked === null ? (
                <Button type="button" variant="secondary" onClick={() => setAnswer(item.sentence)}>
                  It&apos;s already right
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <>
            <RecordCompare itemId={item.id} text={item.sentence} />
            <RateRow onRate={(r) => record(r === "nailed")} />
          </>
        )}
      </Surface>
      <button type="button" onClick={onCancel} className="self-start px-1 text-sm font-semibold text-iron-grey">
        Stop and come back later
      </button>
    </div>
  );
}
