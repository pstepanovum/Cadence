// FILE: src/components/learn-hub/ExerciseCard.tsx
//
// One exercise of any kind, graded on the device with gradeExercise (no
// network, no cost). Reports the result once the learner checks.
"use client";

import Link from "next/link";
import { useId, useMemo, useState, type FormEvent } from "react";
import { speakWord } from "@/components/mouth-map/speak";
import { Button } from "@/components/ui/button";
import {
  gradeExercise,
  GAP,
  type Exercise,
  type ExerciseAnswer,
  type GradeResult,
} from "@/lib/platform/content-model.ts";
import { cn } from "@/lib/utils";

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface ExerciseCardProps {
  exercise: Exercise;
  onResult: (result: GradeResult) => void;
  onNext: () => void;
  isLast: boolean;
}

export function ExerciseCard({ exercise, onResult, onNext, isLast }: ExerciseCardProps) {
  const [result, setResult] = useState<GradeResult | null>(null);

  function check(answer: ExerciseAnswer) {
    if (result) return;
    const graded = gradeExercise(exercise, answer);
    setResult(graded);
    onResult(graded);
  }

  return (
    <article className="space-y-5 rounded-3xl bg-white px-5 py-6 sm:px-8 sm:py-8" aria-live="polite">
      <header className="space-y-1">
        <p className="eyebrow text-xs text-sage-green">{exercise.level} · {exercise.prompt}</p>
      </header>
      <Body exercise={exercise} disabled={result !== null} onCheck={check} result={result} />
      {result ? (
        <div
          role="status"
          className={cn("space-y-2 rounded-3xl px-4 py-4 text-sm leading-6", result.correct ? "bg-yellow-green text-hunter-green" : "bg-vanilla-cream text-iron-grey")}
        >
          <p className="font-semibold text-hunter-green">
            {result.correct ? "Correct." : result.score > 0 ? `Partly right: ${Math.round(result.score * 100)}%.` : "Not quite."}
          </p>
          {!result.correct ? <p>{expectedText(exercise)}</p> : null}
          {exercise.explanation ? <p>{exercise.explanation}</p> : null}
          {exercise.grammarPointIds[0] ? (
            <Link href={`/grammar/${exercise.grammarPointIds[0]}`} className="inline-block font-semibold text-sage-green underline underline-offset-2">
              Read the grammar
            </Link>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <Button onClick={onNext} className="w-full sm:w-auto" autoFocus>
          {isLast ? "See results" : "Next"}
        </Button>
      ) : null}
    </article>
  );
}

function expectedText(exercise: Exercise): string {
  switch (exercise.kind) {
    case "multiple_choice":
      return `Answer: ${exercise.options[exercise.answer]}`;
    case "gap_fill":
      return `Answer: ${exercise.answers.map((a) => a[0]).join(", ")}`;
    case "sentence_building":
      return `Answer: ${exercise.answer.join(" ")}`;
    case "error_correction":
    case "transformation":
      return `Answer: ${exercise.answers[0]}`;
    case "dictation":
      return `It said: ${exercise.text}`;
    case "matching":
      return exercise.pairs.map((p) => `${p.left} ${p.right}`).join(" · ");
    case "minimal_pair":
      return `The words were ${exercise.words.join(" and ")}.`;
    case "flashcard":
      return exercise.back;
  }
}

interface BodyProps {
  exercise: Exercise;
  disabled: boolean;
  result: GradeResult | null;
  onCheck: (answer: ExerciseAnswer) => void;
}

function Body(props: BodyProps) {
  const { exercise } = props;
  switch (exercise.kind) {
    case "multiple_choice":
      return <MultipleChoice {...props} exercise={exercise} />;
    case "gap_fill":
      return <GapFill {...props} exercise={exercise} />;
    case "sentence_building":
      return <Builder {...props} exercise={exercise} />;
    case "matching":
      return <Matching {...props} exercise={exercise} />;
    case "error_correction":
      return <TypedAnswer {...props} lead={exercise.sentence} kind="error_correction" />;
    case "transformation":
      return <TypedAnswer {...props} lead={exercise.source} hint={exercise.instruction} kind="transformation" />;
    case "dictation":
      return <TypedAnswer {...props} speak={exercise.text} kind="dictation" />;
    case "minimal_pair":
      return <MinimalPair {...props} exercise={exercise} />;
    case "flashcard":
      return <FlashcardBody {...props} exercise={exercise} />;
  }
}

function MultipleChoice({ exercise, disabled, onCheck }: BodyProps & { exercise: Extract<Exercise, { kind: "multiple_choice" }> }) {
  const [choice, setChoice] = useState<number | null>(null);
  const id = useId();
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-xl font-semibold text-hunter-green sm:text-2xl">{exercise.question}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {exercise.options.map((option, index) => (
          <label
            key={option}
            htmlFor={`${id}-${index}`}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-base ring-1",
              choice === index ? "bg-yellow-green text-hunter-green ring-yellow-green" : "bg-vanilla-cream text-hunter-green ring-transparent",
              disabled && index === exercise.answer ? "ring-2 ring-sage-green" : "",
            )}
          >
            <input
              id={`${id}-${index}`}
              type="radio"
              name={id}
              className="h-4 w-4 accent-[var(--sage-green)]"
              checked={choice === index}
              onChange={() => setChoice(index)}
            />
            {option}
          </label>
        ))}
      </div>
      {!disabled ? (
        <Button disabled={choice === null} onClick={() => choice !== null && onCheck({ kind: "multiple_choice", choice })}>
          Check
        </Button>
      ) : null}
    </fieldset>
  );
}

function GapFill({ exercise, disabled, onCheck, result }: BodyProps & { exercise: Extract<Exercise, { kind: "gap_fill" }> }) {
  const parts = exercise.text.split(GAP);
  const [gaps, setGaps] = useState<string[]>(() => parts.slice(1).map(() => ""));
  const listId = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    onCheck({ kind: "gap_fill", gaps });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xl leading-10 text-hunter-green sm:text-2xl">
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 ? (
              <input
                aria-label={`Gap ${index + 1}`}
                value={gaps[index]}
                disabled={disabled}
                list={exercise.bank ? listId : undefined}
                onChange={(event) => setGaps((current) => current.map((g, i) => (i === index ? event.target.value : g)))}
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "mx-1 inline-block w-32 rounded-xl bg-vanilla-cream px-3 py-1 text-center text-lg ring-1 ring-alabaster-grey",
                  result?.parts?.[index] === false ? "ring-2 ring-blushed-brick" : result?.parts?.[index] ? "ring-2 ring-sage-green" : "",
                )}
              />
            ) : null}
          </span>
        ))}
      </p>
      {exercise.bank ? (
        <>
          <datalist id={listId}>{exercise.bank.map((word) => <option key={word} value={word} />)}</datalist>
          <p className="text-sm text-iron-grey">Words: {exercise.bank.join(" · ")}</p>
        </>
      ) : null}
      {!disabled ? <Button type="submit" disabled={gaps.some((g) => g.trim() === "")}>Check</Button> : null}
    </form>
  );
}

function Builder({ exercise, disabled, onCheck }: BodyProps & { exercise: Extract<Exercise, { kind: "sentence_building" }> }) {
  const tiles = useMemo(
    () => shuffled([...exercise.answer, ...(exercise.distractors ?? [])].map((text, index) => ({ text, index }))),
    [exercise],
  );
  const [picked, setPicked] = useState<number[]>([]);
  const used = new Set(picked);
  return (
    <div className="space-y-4">
      <div
        className="flex min-h-16 flex-wrap items-center gap-2 rounded-3xl bg-vanilla-cream px-3 py-3"
        aria-label={`Your sentence: ${picked.map((i) => tiles.find((t) => t.index === i)!.text).join(" ") || "empty"}`}
      >
        {picked.length === 0 ? <span className="px-2 text-sm text-slate-grey">Tap the words in order.</span> : null}
        {picked.map((index) => {
          const tile = tiles.find((t) => t.index === index)!;
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => setPicked((p) => p.filter((i) => i !== index))}
              className="min-h-11 cursor-pointer rounded-2xl bg-hunter-green px-3 text-base font-semibold text-white"
              aria-label={`Remove ${tile.text}`}
            >
              {tile.text}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.index}
            type="button"
            disabled={disabled || used.has(tile.index)}
            onClick={() => setPicked((p) => [...p, tile.index])}
            className="min-h-11 cursor-pointer rounded-2xl bg-white px-3 text-base font-semibold text-hunter-green ring-1 ring-alabaster-grey disabled:cursor-default disabled:opacity-30"
          >
            {tile.text}
          </button>
        ))}
      </div>
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={picked.length === 0}
            onClick={() => onCheck({ kind: "sentence_building", tokens: picked.map((i) => tiles.find((t) => t.index === i)!.text) })}
          >
            Check
          </Button>
          <Button variant="ghost" onClick={() => setPicked([])} disabled={picked.length === 0}>
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Matching({ exercise, disabled, onCheck, result }: BodyProps & { exercise: Extract<Exercise, { kind: "matching" }> }) {
  const rights = useMemo(() => shuffled(exercise.pairs.map((pair, index) => ({ text: pair.right, index }))), [exercise]);
  const [mapping, setMapping] = useState<(number | null)[]>(() => exercise.pairs.map(() => null));
  const [active, setActive] = useState<number | null>(0);
  const taken = new Set(mapping.filter((m): m is number => m !== null));

  function pickRight(rightIndex: number) {
    if (active === null) return;
    const next = mapping.map((m, i) => (i === active ? rightIndex : m === rightIndex ? null : m));
    setMapping(next);
    const nextEmpty = next.findIndex((m) => m === null);
    setActive(nextEmpty === -1 ? null : nextEmpty);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-iron-grey">Choose an item on the left, then its match on the right.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ul className="space-y-2" aria-label="Left side">
          {exercise.pairs.map((pair, index) => {
            const chosen = mapping[index];
            return (
              <li key={pair.left}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setActive(index)}
                  aria-pressed={active === index}
                  className={cn(
                    "flex min-h-12 w-full cursor-pointer flex-col items-start rounded-2xl px-4 py-2 text-left text-base ring-1",
                    active === index ? "bg-yellow-green text-hunter-green ring-yellow-green" : "bg-vanilla-cream text-hunter-green ring-transparent",
                    result?.parts?.[index] === false ? "ring-2 ring-blushed-brick" : result?.parts?.[index] ? "ring-2 ring-sage-green" : "",
                  )}
                >
                  <span className="font-semibold">{pair.left}</span>
                  <span className="text-sm text-iron-grey">{chosen !== null ? `→ ${rights.find((r) => r.index === chosen)!.text}` : "not matched yet"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="space-y-2" aria-label="Right side">
          {rights.map((right) => (
            <li key={right.index}>
              <button
                type="button"
                disabled={disabled || active === null}
                onClick={() => pickRight(right.index)}
                className={cn(
                  "min-h-12 w-full cursor-pointer rounded-2xl bg-white px-4 py-2 text-left text-base text-hunter-green ring-1 ring-alabaster-grey disabled:cursor-default",
                  taken.has(right.index) ? "opacity-50" : "",
                )}
              >
                {right.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {!disabled ? (
        <Button disabled={mapping.some((m) => m === null)} onClick={() => onCheck({ kind: "matching", mapping: mapping.map((m) => m ?? -1) })}>
          Check
        </Button>
      ) : null}
    </div>
  );
}

function TypedAnswer({
  disabled,
  onCheck,
  lead,
  hint,
  speak,
  kind,
}: BodyProps & { lead?: string; hint?: string; speak?: string; kind: "error_correction" | "transformation" | "dictation" }) {
  const [text, setText] = useState(lead && kind === "error_correction" ? lead : "");
  const id = useId();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onCheck({ kind, text });
      }}
    >
      {lead ? <p className="text-xl font-semibold text-hunter-green sm:text-2xl">{lead}</p> : null}
      {hint ? <p className="text-sm text-iron-grey">{hint}</p> : null}
      {speak ? (
        <Button type="button" variant="ghost" onClick={() => speakWord(speak)}>
          Play the sentence
        </Button>
      ) : null}
      <label htmlFor={id} className="sr-only">Your answer</label>
      <textarea
        id={id}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        autoCapitalize="sentences"
        spellCheck={false}
        className="w-full rounded-2xl bg-vanilla-cream px-4 py-3 text-lg text-hunter-green ring-1 ring-alabaster-grey"
      />
      {!disabled ? <Button type="submit" disabled={text.trim() === ""}>Check</Button> : null}
    </form>
  );
}

function MinimalPair({ exercise, disabled, onCheck }: BodyProps & { exercise: Extract<Exercise, { kind: "minimal_pair" }> }) {
  const [played] = useState<0 | 1>(() => (Math.random() < 0.5 ? 0 : 1));
  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" onClick={() => speakWord(exercise.words[played])}>
        Play the word
      </Button>
      <div className="grid grid-cols-2 gap-2">
        {exercise.words.map((word, index) => (
          <Button key={word} disabled={disabled} variant="secondary" onClick={() => onCheck({ kind: "minimal_pair", played, choice: index as 0 | 1 })}>
            {word}
          </Button>
        ))}
      </div>
    </div>
  );
}

function FlashcardBody({ exercise, disabled, onCheck }: BodyProps & { exercise: Extract<Exercise, { kind: "flashcard" }> }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-3xl font-semibold text-hunter-green">{exercise.front}</p>
      {shown ? (
        <div className="space-y-2">
          <p className="text-lg text-iron-grey">{exercise.back}</p>
          {exercise.example ? <p className="text-base italic text-iron-grey">{exercise.example.text}</p> : null}
        </div>
      ) : null}
      {!shown ? (
        <Button onClick={() => setShown(true)}>Show answer</Button>
      ) : !disabled ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["again", "hard", "good", "easy"] as const).map((grade) => (
            <Button key={grade} variant={grade === "again" ? "ghost" : "secondary"} onClick={() => onCheck({ kind: "flashcard", grade })}>
              {grade[0].toUpperCase() + grade.slice(1)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
