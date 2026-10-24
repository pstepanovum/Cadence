// FILE: src/components/learn-hub/GrammarBrowser.tsx
//
// Grammar by CEFR level, with a search across every level.
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LevelPicker, useLevel } from "@/components/learn-hub/LevelPicker";
import { useAllPacks } from "@/components/learn-hub/packs";
import { EmptyState } from "@/components/ui/empty-state";
import { normalizeAnswer, type CefrLevel, type GrammarPoint } from "@/lib/platform/content-model.ts";

export function GrammarBrowser({ initialLevel }: { initialLevel: CefrLevel | null }) {
  const [level, setLevel] = useLevel(initialLevel);
  const [query, setQuery] = useState("");
  const packs = useAllPacks();

  const points = useMemo(() => {
    if (!packs) return null;
    const all = packs.flatMap((pack) => pack.content.grammarPoints);
    const q = normalizeAnswer(query);
    if (!q) return all.filter((gp) => gp.level === level);
    return all.filter((gp) => normalizeAnswer(`${gp.title} ${gp.summary} ${gp.patterns.join(" ")}`).includes(q));
  }, [packs, level, query]);

  const topics = useMemo(() => new Map(packs?.flatMap((p) => p.content.topics.map((t) => [t.id, t.title] as const)) ?? []), [packs]);

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-3xl bg-white px-5 py-6 sm:px-8">
        <div>
          <p className="eyebrow text-sm text-sage-text">Grammar</p>
          <h1 className="mt-1 text-3xl font-semibold text-hunter-green sm:text-4xl">Grammar by level</h1>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <LevelPicker level={level} onChange={setLevel} />
          <label className="w-full md:max-w-xs">
            <span className="sr-only">Search grammar</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search, e.g. passive"
              className="min-h-12 w-full rounded-full bg-vanilla-cream px-4 text-sm text-hunter-green ring-1 ring-alabaster-grey placeholder:text-slate-grey"
            />
          </label>
        </div>
      </section>

      {points === null ? (
        <p className="rounded-3xl bg-white px-6 py-10 text-center text-iron-grey" role="status">Loading…</p>
      ) : points.length === 0 ? (
        <EmptyState title={query ? "No grammar matches that" : "No grammar at this level yet"} action={{ label: "Clear the search", onClick: () => setQuery("") }}>
          Try a shorter word, or another level.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {points.map((gp: GrammarPoint) => (
            <li key={gp.id}>
              <Link href={`/grammar/${gp.id}`} className="flex h-full flex-col rounded-3xl bg-white px-5 py-5 transition-colors hover:bg-yellow-green">
                <span className="text-xs font-semibold text-sage-text">{gp.level} · {topics.get(gp.topicId) ?? ""}</span>
                <span className="mt-1 font-kicker text-xl text-hunter-green">{gp.title}</span>
                <span className="mt-1 text-sm leading-6 text-iron-grey">{gp.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
