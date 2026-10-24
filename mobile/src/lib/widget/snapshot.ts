// What the Home Screen and Lock Screen widgets show, as one small JSON
// document the app writes into the App Group and the widget extension reads
// (mobile/targets/widget/Snapshot.swift decodes every field below). The
// widget cannot run JavaScript and the app may not open for days, so the
// snapshot carries a week of words and the rule for a new day
// (`advanceSnapshot`, mirrored in Swift). Pure, so it is unit tested
// (tests/widget.test.ts).
import { VOCABULARY, type VocabWord } from "../../data/vocabulary.ts";
import { shiftDay } from "../../platform/progress-model.ts";

export const WIDGET_SNAPSHOT_VERSION = 1;
/** Words carried ahead, so the medium widget changes at midnight on its own. */
export const WORD_DAYS = 8;

export interface WidgetWord {
  day: string;
  id: string;
  word: string;
  ipa: string;
  definition: string;
}

export interface CadenceWidgetSnapshot {
  version: number;
  updatedAt: number;
  /** The learner's local day when written. */
  today: string;
  timeZone: string;
  streak: number;
  freezes: number;
  practisedToday: boolean;
  goalMinutes: number;
  minutesToday: number;
  words: WidgetWord[];
}

/** Deep links the widgets open; mirrored in Snapshot.swift. */
export const WIDGET_LINKS = {
  home: "cadence:///",
  word: (id: string) => `cadence:///word/${encodeURIComponent(id)}`,
} as const;

function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T12:00:00Z`) / 86_400_000);
}

/** The word of the day: the same for everyone on a given date, cycling through the list. */
export function wordOfTheDay(day: string, list: readonly VocabWord[] = VOCABULARY): VocabWord {
  const n = list.length;
  // A stride coprime with the list length walks it in a mixed order.
  const stride = n % 37 === 0 ? 1 : 37;
  return list[(((dayNumber(day) * stride) % n) + n) % n];
}

export interface SnapshotInput {
  today: string;
  timeZone: string;
  streak: number;
  freezes: number;
  practisedToday: boolean;
  goalMinutes: number;
  minutesToday: number;
  updatedAt: number;
}

export function buildWidgetSnapshot(input: SnapshotInput): CadenceWidgetSnapshot {
  const words = Array.from({ length: WORD_DAYS }, (_, i) => {
    const day = shiftDay(input.today, i);
    const w = wordOfTheDay(day);
    return { day, id: w.id, word: w.word, ipa: w.ipa, definition: w.definition.slice(0, 140) };
  });
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    updatedAt: input.updatedAt,
    today: input.today,
    timeZone: input.timeZone,
    streak: Math.max(0, Math.round(input.streak)),
    freezes: Math.max(0, Math.round(input.freezes)),
    practisedToday: input.practisedToday,
    goalMinutes: Math.max(1, Math.round(input.goalMinutes)),
    minutesToday: Math.max(0, Math.round(input.minutesToday)),
    words,
  };
}

function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export interface WidgetDay {
  today: string;
  streak: number;
  practisedToday: boolean;
  minutesToday: number;
  goalMinutes: number;
  word: WidgetWord | null;
}

/**
 * What the widget shows on `day`, which may be after the snapshot was written.
 * Each fully missed day spends a freeze; with none left the streak shows 0.
 */
export function advanceSnapshot(snapshot: CadenceWidgetSnapshot, day: string): WidgetDay {
  const word = snapshot.words.find((w) => w.day === day) ?? snapshot.words[snapshot.words.length - 1] ?? null;
  if (day <= snapshot.today) {
    return { today: snapshot.today, streak: snapshot.streak, practisedToday: snapshot.practisedToday, minutesToday: snapshot.minutesToday, goalMinutes: snapshot.goalMinutes, word };
  }
  const gap = daysBetween(snapshot.today, day);
  const missed = gap - 1 + (snapshot.practisedToday ? 0 : 1);
  const streak = missed <= snapshot.freezes ? snapshot.streak : 0;
  return { today: day, streak, practisedToday: false, minutesToday: 0, goalMinutes: snapshot.goalMinutes, word };
}
