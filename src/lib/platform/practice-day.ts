// FILE: src/lib/platform/practice-day.ts
//
// Today's drill list across the advanced material (docs/PLATFORM.md sections
// 17 and 18): what the learner's assistant assigned, phrases and slang due for
// review, a few new phrases, and the plateau track's steps. The phone, the web
// and the connector's `get_todays_drills` build it with this one function, so
// "today" means the same everywhere. Also the steps of a spoken drill session:
// one sentence at a time with what it means and how to say it. Pure.
//
// Twin: mobile/src/platform/practice-day.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import { dailyDrills, dateOf, type FossilError, type Track } from "./fossilization.ts";
import { dailyNewOrder, itemKind, type Phrase, type PracticeListItem, type SlangEntry } from "./phrase-bank.ts";
import { isDue, isNew, type CardState } from "./srs.ts";

export type PracticeReason = "assigned" | "due" | "new" | "plateau";

export interface PracticeDayItem {
  itemId: string;
  kind: "phrase" | "slang" | "drill";
  reason: PracticeReason;
  /** What to say aloud. */
  say: string;
  /** What it means, or what the step is for. */
  meaning: string;
  /** A short how-to: register, the trap, or the drill's instruction. */
  tip: string;
}

export interface PracticeDayInput {
  day: string;
  phrases: readonly Phrase[];
  slang: readonly SlangEntry[];
  /** Review state of phrases and slang, by item id. */
  cards: Readonly<Record<string, CardState>>;
  list: readonly PracticeListItem[];
  track: Track | null;
  catalog: readonly FossilError[];
  /** Phrases at or near the learner's level come first among new ones. */
  levels?: readonly string[];
  limits?: { assigned?: number; due?: number; fresh?: number; plateauMinutes?: number };
}

export interface PracticeDay {
  day: string;
  items: PracticeDayItem[];
  counts: Record<PracticeReason, number>;
}

function phraseItem(phrase: Phrase, reason: PracticeReason): PracticeDayItem {
  return { itemId: phrase.id, kind: "phrase", reason, say: phrase.example, meaning: `${phrase.text}: ${phrase.meaning}`, tip: phrase.note };
}

function slangItem(entry: SlangEntry, reason: PracticeReason): PracticeDayItem {
  return { itemId: entry.id, kind: "slang", reason, say: entry.examples[0], meaning: `${entry.term}: ${entry.meaning}`, tip: `${entry.usageNote}${entry.dated ? " Sounds a little dated now." : ""}` };
}

export function buildPracticeDay(input: PracticeDayInput): PracticeDay {
  const limits = { assigned: 10, due: 15, fresh: 5, plateauMinutes: 8, ...input.limits };
  const now = dateOf(input.day);
  const phrases = new Map(input.phrases.map((p) => [p.id, p]));
  const slang = new Map(input.slang.map((s) => [s.id, s]));
  const items: PracticeDayItem[] = [];
  const used = new Set<string>();
  const push = (item: PracticeDayItem | null) => {
    if (!item || used.has(item.itemId)) return;
    used.add(item.itemId);
    items.push(item);
  };
  const resolve = (id: string, reason: PracticeReason) => {
    const p = phrases.get(id);
    if (p) return phraseItem(p, reason);
    const s = slang.get(id);
    return s ? slangItem(s, reason) : null;
  };

  // Assigned first: the learner (or their assistant) asked for these, oldest first, skipping ones reviewed today.
  for (const item of input.list.slice(0, 200)) {
    if (items.length >= limits.assigned) break;
    const card = input.cards[item.itemId];
    if (card && !isNew(card) && !isDue(card, now)) continue;
    push(resolve(item.itemId, "assigned"));
  }

  // Due reviews, most overdue first.
  const due = Object.entries(input.cards)
    .filter(([id, card]) => (itemKind(id) === "phrase" || itemKind(id) === "slang") && isDue(card, now))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[0] < b[0] ? -1 : 1))
    .slice(0, limits.due);
  for (const [id] of due) push(resolve(id, "due"));

  // A few new phrases, the learner's levels first, in the day's shared order.
  const levels = input.levels?.length ? input.levels : ["B2", "C1", "C2"];
  const unseen = input.phrases.filter((p) => isNew(input.cards[p.id]) && !used.has(p.id));
  const preferred = unseen.filter((p) => levels.includes(p.level));
  const order = dailyNewOrder((preferred.length ? preferred : unseen).map((p) => p.id), input.day).slice(0, limits.fresh);
  for (const id of order) push(resolve(id, "new"));

  // The plateau track's steps for today.
  if (input.track) {
    for (const step of dailyDrills(input.track, input.catalog, input.day, { minutes: limits.plateauMinutes })) {
      const error = step.errorId ? input.catalog.find((e) => e.id === step.errorId) : undefined;
      push({
        itemId: step.id,
        kind: "drill",
        reason: "plateau",
        say: step.text,
        meaning: error ? error.title : "A sentence from your own speech, corrected.",
        tip: step.kind === "contrast" && step.alt ? `Not "${step.alt}". ${step.note ?? ""}`.trim() : step.kind === "minimal_pair" && step.alt ? `Contrast it with "${step.alt}".` : step.kind === "stress" && step.alt ? `Stress: ${step.alt}` : (error?.listenFor ?? "Say it three times, the same way each time."),
      });
    }
  }

  const counts: Record<PracticeReason, number> = { assigned: 0, due: 0, new: 0, plateau: 0 };
  for (const item of items) counts[item.reason] += 1;
  return { day: input.day, items, counts };
}

/** One step of a hands-free spoken drill. */
export interface SpokenStep {
  n: number;
  total: number;
  itemId: string;
  say: string;
  meaning: string;
  tip: string;
  /** How many times to say it before moving on. */
  reps: number;
}

/** The steps of a spoken drill session over today's items (or any list), at most `count`. */
export function spokenSteps(items: readonly PracticeDayItem[], count: number): SpokenStep[] {
  const chosen = items.slice(0, Math.max(1, Math.min(30, count)));
  return chosen.map((item, i) => ({ n: i + 1, total: chosen.length, itemId: item.itemId, say: item.say, meaning: item.meaning, tip: item.tip, reps: item.kind === "drill" ? 3 : 2 }));
}
