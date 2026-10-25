// FILE: src/components/advanced/RecordingsLibrary.tsx
//
// Every take the learner kept in this browser, by item or by date: play it,
// hear it against the target, save it as a file, or delete it. Nothing here
// is uploaded.
"use client";

import { Download, Play, Trash } from "griddy-icons";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { filterIndex, formatBytes, formatDuration, groupByDay, groupByItem, RECORDING_KIND_LABELS, totals, type Recording } from "@/lib/platform/recordings.ts";
import { dayKey } from "@/lib/platform/srs.ts";
import { deleteTakes, exportTake, takeBlob, useRecordingIndex } from "./recordings-store";
import { playTarget } from "./target-audio";
import { AdvancedNav, Chip, Empty, Loading, PageHead, Surface, Tag } from "./ui";

async function play(take: Recording) {
  const blob = await takeBlob(take);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(() => undefined);
}

export function RecordingsLibrary() {
  const index = useRecordingIndex();
  const [view, setView] = useState<"item" | "day">("item");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => (index ? filterIndex(index, { query }) : null), [index, query]);
  if (!index || !filtered) return <Loading label="Loading your recordings" />;
  const sum = totals(index);

  const Row = ({ take }: { take: Recording }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] px-3 py-2 hover:bg-platinum">
      <span className="text-sm text-iron-grey">
        {new Date(take.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {formatDuration(take.durationMs)}
      </span>
      <span className="flex gap-1">
        <button type="button" onClick={() => void play(take)} aria-label="Play your take" className="rounded-[10px] p-2 hover:bg-alabaster-grey">
          <Play size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void playTarget(take.text).then(() => play(take))} className="rounded-[10px] px-3 py-1.5 text-sm font-semibold hover:bg-alabaster-grey">
          A/B
        </button>
        <button type="button" onClick={() => void exportTake(take)} aria-label="Save as a file" className="rounded-[10px] p-2 hover:bg-alabaster-grey">
          <Download size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void deleteTakes([take.id])} aria-label="Delete" className="rounded-[10px] p-2 hover:bg-alabaster-grey">
          <Trash size={16} aria-hidden="true" />
        </button>
      </span>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <PageHead eyebrow="Recordings" title="Your own voice, kept for comparison">
        Every take you keep stays in this browser and is never uploaded. Listen back against the target to hear what changed.
        {sum.takes ? (
          <span className="mt-1 block text-sm text-slate-grey">
            {sum.takes} takes of {sum.items} items · {formatDuration(sum.durationMs)} · {formatBytes(sum.bytes)}
          </span>
        ) : null}
      </PageHead>
      {index.items.length === 0 ? (
        <Empty title="No recordings yet">Record yourself on any phrase, slang example or plateau drill and the take appears here.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip selected={view === "item"} onClick={() => setView("item")}>By item</Chip>
            <Chip selected={view === "day"} onClick={() => setView("day")}>By date</Chip>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a sentence" aria-label="Find a sentence" className="min-h-10 flex-1 rounded-[12px] bg-platinum px-4 text-sm text-carbon-black placeholder:text-slate-grey sm:max-w-xs" />
          </div>
          {view === "item"
            ? groupByItem(filtered).map((group) => (
                <Surface key={group.itemId} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="max-w-2xl text-base leading-7 text-carbon-black">{group.text}</p>
                    <Tag>{RECORDING_KIND_LABELS[group.kind]}</Tag>
                  </div>
                  <ul className="flex flex-col">{group.takes.map((take) => <Row key={take.id} take={take} />)}</ul>
                </Surface>
              ))
            : groupByDay(filtered, (ms) => dayKey(new Date(ms))).map((group) => (
                <Surface key={group.day} className="flex flex-col gap-2">
                  <p className="font-semibold text-carbon-black">{new Date(`${group.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
                  <ul className="flex flex-col">
                    {group.takes.map((take) => (
                      <div key={take.id}>
                        <p className="px-3 pt-2 text-sm text-carbon-black">{take.text}</p>
                        <Row take={take} />
                      </div>
                    ))}
                  </ul>
                </Surface>
              ))}
          <div>
            <Button variant="danger" onClick={() => window.confirm("Delete every recording in this browser? This can't be undone.") && void deleteTakes(index.items.map((r) => r.id))}>
              Delete all recordings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
