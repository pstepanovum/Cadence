// FILE: src/components/learn-hub/GrammarPointView.tsx
"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { useAllPacks } from "@/components/learn-hub/packs";
import { speakWord } from "@/components/mouth-map/speak";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Example } from "@/lib/platform/content-model.ts";

/** Explanations allow `*emphasis*` and nothing else. */
function Emphasis({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? <em key={i} className="font-semibold not-italic text-hunter-green">{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

function ExampleLine({ example }: { example: Example }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-2xl bg-vanilla-cream px-4 py-3">
      <div>
        <p className="text-base text-hunter-green">{example.text}</p>
        {example.note ? <p className="text-sm text-iron-grey">{example.note}</p> : null}
        {example.source.kind === "tatoeba" ? (
          <p className="text-xs text-slate-grey">
            <a href={`https://tatoeba.org/en/sentences/show/${example.source.sentenceId}`} className="underline" rel="noopener noreferrer" target="_blank">
              Tatoeba #{example.source.sentenceId}
            </a>
            {example.source.author ? ` by ${example.source.author}` : ""}, CC BY 2.0 FR
          </p>
        ) : null}
      </div>
      <button type="button" onClick={() => speakWord(example.text)} className="min-h-11 shrink-0 cursor-pointer rounded-full px-3 text-sm font-semibold text-sage-green" aria-label={`Hear: ${example.text}`}>
        Hear
      </button>
    </li>
  );
}

export function GrammarPointView({ pointId }: { pointId: string }) {
  const packs = useAllPacks();
  const found = useMemo(() => {
    if (!packs) return undefined;
    const all = packs.flatMap((p) => p.content.grammarPoints);
    const point = all.find((gp) => gp.id === pointId) ?? null;
    return { point, related: point ? all.filter((gp) => point.related.includes(gp.id)) : [] };
  }, [packs, pointId]);

  if (found === undefined) return <p className="rounded-3xl bg-white px-6 py-10 text-center text-iron-grey" role="status">Loading…</p>;
  if (!found.point) {
    return <EmptyState title="This grammar topic is not here" action={{ label: "Browse grammar", href: "/grammar" }}>It may be in a level that has not downloaded yet.</EmptyState>;
  }
  const gp = found.point;

  return (
    <article className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-4 rounded-3xl bg-white px-5 py-6 sm:px-8 sm:py-8">
        <p className="eyebrow text-sm text-sage-green">
          <Link href={`/grammar?level=${gp.level}`} className="underline-offset-2 hover:underline">Grammar</Link> · {gp.level}
        </p>
        <h1 className="text-3xl font-semibold text-hunter-green sm:text-4xl">{gp.title}</h1>
        <p className="text-lg text-iron-grey">{gp.summary}</p>
        {gp.explanation.split(/\n\n+/).map((paragraph) => (
          <p key={paragraph} className="text-base leading-8 text-iron-grey"><Emphasis text={paragraph} /></p>
        ))}
        <section>
          <h2 className="font-kicker text-xl text-hunter-green">Examples</h2>
          <ul className="mt-2 space-y-2">{gp.examples.map((example) => <ExampleLine key={example.text} example={example} />)}</ul>
        </section>
      </div>
      <div className="flex flex-col gap-4">
        <section className="rounded-3xl bg-white px-5 py-6">
          <h2 className="font-kicker text-xl text-hunter-green">Patterns</h2>
          <ul className="mt-2 space-y-1.5">
            {gp.patterns.map((pattern) => <li key={pattern} className="rounded-2xl bg-vanilla-cream px-3 py-2 font-mono text-sm text-hunter-green">{pattern}</li>)}
          </ul>
        </section>
        {gp.commonErrors.length > 0 ? (
          <section className="rounded-3xl bg-white px-5 py-6">
            <h2 className="font-kicker text-xl text-hunter-green">Common mistakes</h2>
            <ul className="mt-2 space-y-3">
              {gp.commonErrors.map((error) => (
                <li key={error.wrong} className="text-sm leading-6">
                  <p className="text-blushed-brick"><span className="sr-only">Wrong: </span><s>{error.wrong}</s></p>
                  <p className="font-semibold text-hunter-green"><span className="sr-only">Right: </span>{error.right}</p>
                  <p className="text-iron-grey">{error.note}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="space-y-3 rounded-3xl bg-hunter-green px-5 py-6 text-white">
          <h2 className="font-kicker text-xl">Practise it</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" href={`/practice/quiz?level=${gp.level}&gp=${gp.id}`}>Quiz</Button>
            <Button className="bg-white/10 text-white" href={`/practice/sentences?level=${gp.level}&gp=${gp.id}`}>Sentences</Button>
          </div>
          {found.related.length > 0 ? (
            <p className="text-sm text-white/80">
              Next:{" "}
              {found.related.map((r, i) => (
                <Fragment key={r.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/grammar/${r.id}`} className="font-semibold text-yellow-green underline underline-offset-2">{r.title}</Link>
                </Fragment>
              ))}
            </p>
          ) : null}
        </section>
      </div>
    </article>
  );
}
