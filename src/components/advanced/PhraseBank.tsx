// FILE: src/components/advanced/PhraseBank.tsx
//
// The phrase bank: chunks, collocations and sentence frames for B2 to C2,
// filtered by level, situation and kind, searchable, each opening its own
// page with drills and recording.
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { isDue, isNew } from "@/lib/platform/srs.ts";
import { PHRASE_KINDS, PHRASE_LEVELS, PHRASE_SITUATIONS, searchPhrases, type PhraseKind } from "@/lib/platform/phrase-bank.ts";
import type { CefrLevel } from "@/lib/platform/content-model.ts";
import { useAdvancedContent } from "./content";
import { useAdvancedState } from "./store";
import { AdvancedNav, Chip, Empty, Loading, PageHead, RowLink, Surface, Tag } from "./ui";

const KIND_LABELS: Record<PhraseKind, string> = { chunk: "Chunks", collocation: "Collocations", frame: "Sentence frames" };
const PAGE = 60;

export function PhraseBank() {
  const content = useAdvancedContent();
  const state = useAdvancedState();
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [situation, setSituation] = useState<string>("");
  const [kind, setKind] = useState<PhraseKind | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const results = useMemo(
    () => (content ? searchPhrases(content.phrases, { query, level: level ?? undefined, situation: situation || undefined, kind: kind ?? undefined, limit: 100_000 }) : []),
    [content, query, level, situation, kind],
  );
  const now = new Date();
  const phraseIds = content?.phrases.map((p) => p.id) ?? [];
  const started = phraseIds.filter((id) => !isNew(state.cards[id])).length;
  const due = phraseIds.filter((id) => isDue(state.cards[id], now)).length;

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <PageHead
        eyebrow="Phrase bank"
        title="Learn phrases, not words"
        actions={
          <>
            <Button href="/phrases/practice">{due ? `Practise · ${due} due` : "Practise today's phrases"}</Button>
          </>
        }
      >
        Fluent speech is built from ready-made chunks. These are the ones advanced speakers use at work, in seminars and with friends, with a natural example to hear, record and drill.
        {content ? <span className="mt-1 block text-sm text-slate-grey">{content.phrases.length.toLocaleString()} phrases · {started} started</span> : null}
      </PageHead>

      <Surface className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-semibold text-carbon-black">
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="for example: push back, to be fair, a steep learning curve"
            className="min-h-12 rounded-[14px] bg-platinum px-4 text-base font-normal text-carbon-black placeholder:text-slate-grey focus-visible:outline-2 focus-visible:outline-sage-green"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Level">
          <Chip selected={level === null} onClick={() => setLevel(null)}>All levels</Chip>
          {[...PHRASE_LEVELS].reverse().map((l) => (
            <Chip key={l} selected={level === l} onClick={() => setLevel(l)}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
          <Chip selected={kind === null} onClick={() => setKind(null)}>Every kind</Chip>
          {PHRASE_KINDS.map((k) => (
            <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </Chip>
          ))}
        </div>
        <label className="flex flex-col gap-2 text-sm font-semibold text-carbon-black sm:max-w-sm">
          Situation
          <select value={situation} onChange={(e) => setSituation(e.target.value)} className="min-h-12 rounded-[14px] bg-platinum px-4 text-base font-normal text-carbon-black">
            <option value="">Every situation</option>
            {PHRASE_SITUATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      </Surface>

      {!content ? (
        <Loading label="Loading the phrase bank" />
      ) : content.phrases.length === 0 ? (
        <Empty title="The phrase bank isn't on this server yet">It arrives with the next content update.</Empty>
      ) : results.length === 0 ? (
        <Empty title="Nothing matches">Try fewer words, or clear a filter.</Empty>
      ) : (
        <Surface className="flex flex-col gap-1 p-2 sm:p-3">
          <p className="px-4 py-2 text-sm text-slate-grey">{results.length.toLocaleString()} phrases</p>
          {results.slice(0, shown).map((p) => (
            <RowLink
              key={p.id}
              href={`/phrases/${encodeURIComponent(p.id)}`}
              title={p.text}
              detail={p.meaning}
              meta={
                <>
                  <Tag>{p.level}</Tag>
                  {isDue(state.cards[p.id], now) ? <Tag tone="green">Due</Tag> : !isNew(state.cards[p.id]) ? <Tag tone="muted">Started</Tag> : null}
                </>
              }
            />
          ))}
          {results.length > shown ? (
            <div className="p-3">
              <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                Show more
              </Button>
            </div>
          ) : null}
        </Surface>
      )}
    </div>
  );
}
