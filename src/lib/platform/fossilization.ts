// FILE: src/lib/platform/fossilization.ts
//
// The plateau track (docs/PLATFORM.md section 18): a 10 to 12 week program
// for C1 and C2 speakers whose remaining errors have fossilized. It finds the
// persistent ones from evidence (a short diagnostic, spoken-grammar feedback,
// phoneme scores, weekly re-tests), focuses on a few at a time, schedules
// daily drills (contrasts, repeat-aloud, minimal pairs, shadowing, stress and
// intonation, the learner's own corrected sentences) with the shared spaced
// review, and reports progress per error. Pure and deterministic: no storage,
// no clock, no network.
//
// Twin: mobile/src/platform/fossilization.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

import { normalizeAnswer } from "./content-model.ts";
import { hash32 } from "./phrase-bank.ts";
import { isDue, isNew, review, type CardState, type Grade } from "./srs.ts";

export const FOSSIL_AREAS = ["grammar", "word-choice", "pronunciation", "stress", "intonation"] as const;
export type FossilArea = (typeof FOSSIL_AREAS)[number];

/** One persistent-error pattern from the fossilization pack. */
export interface FossilError {
  /** `fossil.<slug>`, permanent. */
  id: string;
  area: FossilArea;
  title: string;
  what: string;
  summary: string;
  listenFor: string;
  /** Spoken-grammar feedback on these grammar points counts as evidence. */
  grammarPointIds: string[];
  /** Phoneme scores on these sounds count as evidence. */
  soundIds: string[];
  contrasts: { wrong: string; right: string; note: string }[];
  /** Correct sentences dense in the target, said aloud. */
  drills: string[];
  /** Diagnostic and re-test items: a sentence to correct (with `answers`), or one to read aloud. */
  probes: { sentence: string; answers?: string[] }[];
  pairs: [string, string][];
  /** `marked` has the stressed syllables in capitals. */
  stress: { text: string; marked: string; note: string }[];
}

export interface FossilizationData {
  format: 1;
  errors: FossilError[];
}

export const isSpokenArea = (area: FossilArea) => area === "pronunciation" || area === "stress" || area === "intonation";

export function validateFossilError(error: FossilError): string[] {
  const p: string[] = [];
  const id = error.id || "(no id)";
  if (!/^fossil\.[a-z0-9][a-z0-9-]{0,80}$/.test(error.id)) p.push(`${id}: id must look like fossil.<slug>`);
  if (!(FOSSIL_AREAS as readonly string[]).includes(error.area)) p.push(`${id}: unknown area`);
  if (!error.title || error.title.length > 80) p.push(`${id}: title`);
  if (error.drills.length < 6) p.push(`${id}: needs at least 6 drill sentences`);
  if (error.contrasts.length < 3 && error.area !== "stress" && error.area !== "intonation") p.push(`${id}: needs at least 3 contrasts`);
  if (error.probes.length < 3) p.push(`${id}: needs at least 3 probes (diagnostic and re-tests)`);
  if (!isSpokenArea(error.area) && error.probes.some((probe) => !probe.answers?.length)) p.push(`${id}: a written probe needs answers`);
  if (error.area === "pronunciation" && error.pairs.length < 4) p.push(`${id}: needs at least 4 minimal pairs`);
  if ((error.area === "stress" || error.area === "intonation") && error.stress.length < 4) p.push(`${id}: needs at least 4 stress items`);
  for (const s of error.stress) if (s.marked.toLowerCase() !== s.text.toLowerCase()) p.push(`${id}: stress marking changes the words of "${s.text}"`);
  if (error.grammarPointIds.length === 0 && error.soundIds.length === 0 && !["stress", "intonation", "grammar", "word-choice"].includes(error.area)) p.push(`${id}: nothing maps evidence to it`);
  return p;
}

// Evidence and diagnosis ---------------------------------------------------

export type EvidenceSource = "diagnostic" | "spoken" | "pronunciation" | "retest";

export interface Evidence {
  errorId: string;
  /** Local day, YYYY-MM-DD. */
  day: string;
  source: EvidenceSource;
  /** True when the learner got it right (no error, or a good score). */
  ok: boolean;
}

/** Spoken-grammar feedback issues as evidence: each issue is a miss on every error that watches its grammar point. */
export function evidenceFromGrammarIssues(issues: readonly { grammarPointId: string | null }[], catalog: readonly FossilError[], day: string): Evidence[] {
  const out: Evidence[] = [];
  for (const issue of issues) {
    if (!issue.grammarPointId) continue;
    for (const error of catalog) if (error.grammarPointIds.includes(issue.grammarPointId)) out.push({ errorId: error.id, day, source: "spoken", ok: false });
  }
  return out;
}

/** Below this phoneme score a sound counts as a miss. */
export const SOUND_MISS_BELOW = 70;

/**
 * Phoneme scores as evidence: per error, the take's worst score on its sounds
 * is one data point (a miss below SOUND_MISS_BELOW), so one sentence never
 * counts as many.
 */
export function evidenceFromPhonemes(phonemes: readonly { soundId: string; score: number }[], catalog: readonly FossilError[], day: string): Evidence[] {
  const out: Evidence[] = [];
  for (const error of catalog) {
    const scores = phonemes.filter((p) => error.soundIds.includes(p.soundId)).map((p) => p.score);
    if (scores.length) out.push({ errorId: error.id, day, source: "pronunciation", ok: Math.min(...scores) >= SOUND_MISS_BELOW });
  }
  return out;
}

export interface Diagnosis {
  errorId: string;
  misses: number;
  hits: number;
  /** Distinct days with a miss. */
  missDays: number;
  /** Misses over all observations, 0 to 1. */
  missRate: number;
  persistent: boolean;
  /** Higher is worse; orders the focus list. */
  severity: number;
}

/**
 * Which errors are persistent. A diagnostic miss counts twice (it is a
 * deliberate probe); an error is persistent with a miss rate of at least 40%
 * and either two diagnostic misses or misses on at least two different days,
 * so one bad afternoon never starts a program.
 */
export function diagnose(evidence: readonly Evidence[]): Diagnosis[] {
  const byError = new Map<string, Evidence[]>();
  for (const e of evidence) byError.set(e.errorId, [...(byError.get(e.errorId) ?? []), e]);
  const out: Diagnosis[] = [];
  for (const [errorId, items] of byError) {
    const weight = (e: Evidence) => (e.source === "diagnostic" ? 2 : 1);
    const misses = items.filter((e) => !e.ok).reduce((n, e) => n + weight(e), 0);
    const hits = items.filter((e) => e.ok).reduce((n, e) => n + weight(e), 0);
    const missDays = new Set(items.filter((e) => !e.ok).map((e) => e.day)).size;
    const diagnosticMisses = items.filter((e) => !e.ok && e.source === "diagnostic").length;
    const missRate = misses / Math.max(1, misses + hits);
    const persistent = missRate >= 0.4 && (diagnosticMisses >= 2 || missDays >= 2);
    out.push({ errorId, misses, hits, missDays, missRate, persistent, severity: Math.round(missRate * Math.log2(1 + misses) * 1000) / 1000 });
  }
  return out.sort((a, b) => Number(b.persistent) - Number(a.persistent) || b.severity - a.severity || (a.errorId < b.errorId ? -1 : 1));
}

// The diagnostic -------------------------------------------------------------

export type DiagnosticItem =
  | { id: string; errorId: string; kind: "correct"; sentence: string; answers: string[] }
  | { id: string; errorId: string; kind: "read"; sentence: string; soundIds: string[] };

/**
 * The short diagnostic: two written probes for each grammar and word-choice
 * error (correct the sentence), and one read-aloud probe for each spoken one
 * (scored by the engine when one is available, skipped otherwise). About 40
 * items, 10 to 15 minutes.
 */
export function diagnosticItems(catalog: readonly FossilError[]): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  for (const error of catalog) {
    if (isSpokenArea(error.area)) {
      const probe = error.probes[0];
      if (probe) items.push({ id: `${error.id}#diag0`, errorId: error.id, kind: "read", sentence: probe.sentence, soundIds: error.soundIds });
    } else {
      error.probes.slice(0, 2).forEach((probe, i) => items.push({ id: `${error.id}#diag${i}`, errorId: error.id, kind: "correct", sentence: probe.sentence, answers: probe.answers ?? [] }));
    }
  }
  // Interleave so two items on the same error never come back to back.
  return items.sort((a, b) => Number(a.id.endsWith("diag1")) - Number(b.id.endsWith("diag1")) || hash32(a.id) - hash32(b.id));
}

/** A typed correction: right when it matches an accepted answer. */
export function gradeCorrection(answers: readonly string[], typed: string): boolean {
  const given = normalizeAnswer(typed);
  return given.length > 0 && answers.some((a) => normalizeAnswer(a) === given);
}

// The program --------------------------------------------------------------

export const TRACK_WEEKS_MIN = 10;
export const TRACK_WEEKS_MAX = 12;
export const DEFAULT_TRACK_WEEKS = 12;
export const MAX_FOCUS = 4;
export const OWN_SENTENCES_CAP = 40;
/** Two re-tests in a row at or above this mark an error fixed. */
export const FIXED_AT = 85;

export interface Retest {
  week: number;
  day: string;
  /** Per error, 0 to 100. */
  scores: Record<string, number>;
}

export interface OwnSentence {
  id: string;
  /** The corrected sentence, as feedback gave it back. */
  text: string;
  /** What the learner actually said, if known. */
  said?: string;
  errorId?: string;
  addedDay: string;
}

export interface Track {
  format: 1;
  startDay: string;
  weeks: number;
  /** Focus errors, worst first. */
  focus: string[];
  /** Per focus error, accuracy 0 to 100 at the start. */
  baseline: Record<string, number>;
  retests: Retest[];
  ownSentences: OwnSentence[];
  /** Review state of each drill step, by step id. */
  cards: Record<string, CardState>;
  /** Step ids done per day, so today's list shrinks as the learner works. */
  done: Record<string, string[]>;
  updatedAt: number;
}

export function parseDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000;
}

export function addDaysTo(day: string, days: number): string {
  return new Date((parseDay(day) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** The local-day Date that srs.ts expects, at noon so no time zone moves it. */
export function dateOf(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

/** Starts a program on the worst persistent errors (or the worst observed, when nothing is persistent yet). */
export function startTrack(diagnosis: readonly Diagnosis[], startDay: string, options: { weeks?: number; maxFocus?: number; now?: number } = {}): Track {
  const weeks = Math.min(TRACK_WEEKS_MAX, Math.max(TRACK_WEEKS_MIN, Math.round(options.weeks ?? DEFAULT_TRACK_WEEKS)));
  const persistent = diagnosis.filter((d) => d.persistent);
  const chosen = (persistent.length ? persistent : diagnosis.filter((d) => d.misses > 0)).slice(0, options.maxFocus ?? MAX_FOCUS);
  return {
    format: 1,
    startDay,
    weeks,
    focus: chosen.map((d) => d.errorId),
    baseline: Object.fromEntries(chosen.map((d) => [d.errorId, Math.round((1 - d.missRate) * 100)])),
    retests: [],
    ownSentences: [],
    cards: {},
    done: {},
    updatedAt: options.now ?? 0,
  };
}

/** 1 to `weeks` during the program, 0 before it starts, `weeks + 1` once it is over. */
export function weekOf(track: Track, day: string): number {
  const offset = parseDay(day) - parseDay(track.startDay);
  if (offset < 0) return 0;
  return Math.min(track.weeks + 1, Math.floor(offset / 7) + 1);
}

export type Phase = "notice" | "rebuild" | "automate" | "done";

/** Notice (the first two weeks), rebuild (the middle), automate (the last third). */
export function phaseOf(track: Track, week: number): Phase {
  if (week > track.weeks) return "done";
  if (week <= 2) return "notice";
  if (week > track.weeks - Math.round(track.weeks / 3)) return "automate";
  return "rebuild";
}

export const PHASE_COPY: Record<Phase, { title: string; detail: string }> = {
  notice: { title: "Notice", detail: "Hear the error in your own speech. Contrasts and slow, deliberate repetition." },
  rebuild: { title: "Rebuild", detail: "Two errors at a time, every day: the correct form said aloud until it is the easy one." },
  automate: { title: "Automate", detail: "Everything together, at speed: shadowing and your own sentences, so the fix holds in real conversation." },
  done: { title: "Finished", detail: "The program is over. Keep the review going, or start again on what is left." },
};

/** The focus errors drilled in a week: all of them while noticing and automating, two at a time in between, rotating weekly. */
export function activeErrors(track: Track, week: number): string[] {
  const phase = phaseOf(track, week);
  if (phase === "done" || track.focus.length <= 2 || phase !== "rebuild") return phase === "done" ? [] : [...track.focus];
  const fixed = new Set(errorProgress(track).filter((p) => p.status === "fixed").map((p) => p.errorId));
  const open = track.focus.filter((id) => !fixed.has(id));
  const pool = open.length ? open : track.focus;
  const pairs = Math.ceil(pool.length / 2);
  const pair = (week - 3) % pairs;
  return pool.slice(pair * 2, pair * 2 + 2);
}

export type DrillStepKind = "contrast" | "repeat" | "minimal_pair" | "shadowing" | "stress" | "own_sentence";

export const DRILL_STEP_TITLES: Record<DrillStepKind, string> = {
  contrast: "Wrong, then right",
  repeat: "Say it three times",
  minimal_pair: "Minimal pair",
  shadowing: "Shadow it",
  stress: "Stress and rhythm",
  own_sentence: "Your own sentence",
};

export interface DrillStep {
  /** `<errorId>#c<n>`, `#d<n>`, `#p<n>`, `#s<n>`, `#sh<n>`, or `own.<id>`. */
  id: string;
  errorId: string | null;
  kind: DrillStepKind;
  /** What to say. */
  text: string;
  /** For a contrast the wrong version, for a pair the other word, for stress the marked sentence. */
  alt?: string;
  note?: string;
  reps: number;
}

const STEP_SECONDS: Record<DrillStepKind, number> = { contrast: 45, repeat: 40, minimal_pair: 30, shadowing: 60, stress: 45, own_sentence: 45 };

function stepsFor(error: FossilError, phase: Phase): DrillStep[] {
  const steps: DrillStep[] = [];
  const add = (step: Omit<DrillStep, "errorId">) => steps.push({ ...step, errorId: error.id });
  error.contrasts.forEach((c, i) => add({ id: `${error.id}#c${i}`, kind: "contrast", text: c.right, alt: c.wrong, note: c.note, reps: 3 }));
  error.pairs.forEach((pair, i) => add({ id: `${error.id}#p${i}`, kind: "minimal_pair", text: pair[0], alt: pair[1], reps: 3 }));
  error.stress.forEach((s, i) => add({ id: `${error.id}#s${i}`, kind: "stress", text: s.text, alt: s.marked, note: s.note, reps: 3 }));
  error.drills.forEach((d, i) => add({ id: `${error.id}#d${i}`, kind: phase === "automate" && i % 2 === 0 ? "shadowing" : "repeat", text: d, reps: phase === "notice" ? 3 : 2 }));
  // Noticing leans on contrasts and pairs; automating on full sentences.
  const rank = (kind: DrillStepKind) =>
    phase === "notice" ? ["contrast", "minimal_pair", "stress", "repeat", "shadowing"].indexOf(kind) : phase === "automate" ? ["shadowing", "repeat", "stress", "contrast", "minimal_pair"].indexOf(kind) : ["repeat", "contrast", "minimal_pair", "stress", "shadowing"].indexOf(kind);
  return steps.sort((a, b) => rank(a.kind) - rank(b.kind) || hash32(a.id) - hash32(b.id));
}

/**
 * Today's drills, about `minutes` long: for each active error, steps due for
 * review first, then new ones in the phase's order; then the learner's own
 * corrected sentences, oldest unpractised first. Steps already done today are
 * left out, so the list shrinks as the learner works.
 */
export function dailyDrills(track: Track, catalog: readonly FossilError[], day: string, options: { minutes?: number } = {}): DrillStep[] {
  const week = weekOf(track, day);
  const phase = phaseOf(track, week);
  if (week === 0 || phase === "done") return [];
  const budget = (options.minutes ?? 10) * 60;
  const done = new Set(track.done[day] ?? []);
  const now = dateOf(day);
  const active = activeErrors(track, week);
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const out: DrillStep[] = [];
  let used = 0;
  const take = (step: DrillStep) => {
    if (used + STEP_SECONDS[step.kind] > budget) return false;
    out.push(step);
    used += STEP_SECONDS[step.kind];
    return true;
  };

  const perError = active.map((id) => {
    const error = byId.get(id);
    if (!error) return [];
    const all = stepsFor(error, phase).filter((s) => !done.has(s.id));
    const due = all.filter((s) => isDue(track.cards[s.id], now)).sort((a, b) => (track.cards[a.id].due < track.cards[b.id].due ? -1 : 1));
    const fresh = all.filter((s) => isNew(track.cards[s.id]));
    return [...due, ...fresh];
  });
  // Own sentences get a fifth of the time once there are any.
  const own = track.ownSentences
    .map((s): DrillStep => ({ id: `own.${s.id}`, errorId: s.errorId ?? null, kind: "own_sentence", text: s.text, alt: s.said, reps: 3 }))
    .filter((s) => !done.has(s.id) && (isNew(track.cards[s.id]) || isDue(track.cards[s.id], now)));
  const ownBudget = own.length ? Math.round(budget / 5) : 0;

  // Round-robin across active errors so each gets its share.
  let progress = true;
  while (progress && used < budget - ownBudget) {
    progress = false;
    for (const queue of perError) {
      const next = queue.shift();
      if (next && used + STEP_SECONDS[next.kind] <= budget - ownBudget) {
        take(next);
        progress = true;
      }
    }
  }
  for (const step of own) if (!take(step)) break;
  return out;
}

/** Records one drill step: its review state, and that it was done today. */
export function recordDrill(track: Track, stepId: string, grade: Grade, day: string, now: number): Track {
  const doneToday = track.done[day] ?? [];
  // Only today's list is worth keeping; older days are history the cards already hold.
  return {
    ...track,
    cards: { ...track.cards, [stepId]: review(track.cards[stepId], grade, dateOf(day)) },
    done: { [day]: doneToday.includes(stepId) ? doneToday : [...doneToday, stepId] },
    updatedAt: now,
  };
}

/** Adds a corrected sentence from the learner's own speech, newest kept, at most OWN_SENTENCES_CAP. */
export function addOwnSentence(track: Track, sentence: { text: string; said?: string; errorId?: string }, day: string, now: number): Track {
  const text = sentence.text.trim().replace(/\s+/g, " ");
  if (!text || text.length > 240) return track;
  if (track.ownSentences.some((s) => normalizeAnswer(s.text) === normalizeAnswer(text))) return track;
  const id = (hash32(`${text}|${day}`) >>> 0).toString(36);
  const next = [...track.ownSentences, { id, text, ...(sentence.said ? { said: sentence.said.slice(0, 240) } : {}), ...(sentence.errorId ? { errorId: sentence.errorId } : {}), addedDay: day }];
  return { ...track, ownSentences: next.slice(Math.max(0, next.length - OWN_SENTENCES_CAP)), updatedAt: now };
}

// Weekly re-tests -------------------------------------------------------------

/** The day of week `week`'s re-test: the last day of that week. */
export function retestDay(track: Track, week: number): string {
  return addDaysTo(track.startDay, week * 7 - 1);
}

/** The first week whose re-test day has come and has no result yet, or null. */
export function retestDue(track: Track, day: string): number | null {
  const current = Math.min(track.weeks, weekOf(track, day));
  for (let week = 1; week <= current; week += 1) {
    if (retestDay(track, week) > day) break;
    if (!track.retests.some((r) => r.week === week)) return week;
  }
  return null;
}

/**
 * A week's re-test: one probe per focus error, a different probe each week
 * (the diagnostic used the first ones), so the learner meets fresh items.
 */
export function retestItems(track: Track, catalog: readonly FossilError[], week: number): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  for (const errorId of track.focus) {
    const error = catalog.find((e) => e.id === errorId);
    if (!error || error.probes.length === 0) continue;
    const firstFresh = isSpokenArea(error.area) ? 1 : 2;
    const pool = error.probes.length > firstFresh ? error.probes.slice(firstFresh) : error.probes;
    const probe = pool[(week - 1) % pool.length];
    const id = `${error.id}#retest${week}`;
    items.push(isSpokenArea(error.area) ? { id, errorId, kind: "read", sentence: probe.sentence, soundIds: error.soundIds } : { id, errorId, kind: "correct", sentence: probe.sentence, answers: probe.answers ?? [] });
  }
  return items;
}

export function recordRetest(track: Track, week: number, day: string, scores: Record<string, number>, now: number): Track {
  const clean = Object.fromEntries(Object.entries(scores).filter(([id, s]) => track.focus.includes(id) && Number.isFinite(s)).map(([id, s]) => [id, Math.max(0, Math.min(100, Math.round(s)))]));
  const retests = [...track.retests.filter((r) => r.week !== week), { week, day, scores: clean }].sort((a, b) => a.week - b.week);
  return { ...track, retests, updatedAt: now };
}

// Progress -------------------------------------------------------------------

export type ErrorStatus = "persistent" | "improving" | "fixed";

export interface ErrorProgress {
  errorId: string;
  baseline: number;
  latest: number | null;
  history: { week: number; score: number }[];
  trend: "up" | "down" | "flat" | "new";
  status: ErrorStatus;
}

export function errorProgress(track: Track): ErrorProgress[] {
  return track.focus.map((errorId) => {
    const baseline = track.baseline[errorId] ?? 0;
    const history = track.retests.filter((r) => typeof r.scores[errorId] === "number").map((r) => ({ week: r.week, score: r.scores[errorId] }));
    const latest = history.length ? history[history.length - 1].score : null;
    const lastTwo = history.slice(-2);
    const fixed = lastTwo.length === 2 && lastTwo.every((h) => h.score >= FIXED_AT);
    const trend = history.length === 0 ? "new" : latest! - (history.length > 1 ? history[history.length - 2].score : baseline) > 5 ? "up" : latest! - (history.length > 1 ? history[history.length - 2].score : baseline) < -5 ? "down" : "flat";
    const status: ErrorStatus = fixed ? "fixed" : latest !== null && latest >= baseline + 15 ? "improving" : "persistent";
    return { errorId, baseline, latest, history, trend, status };
  });
}

export interface TrackSummary {
  week: number;
  weeks: number;
  phase: Phase;
  /** Days until the program ends, 0 once it is over. */
  daysLeft: number;
  activeErrors: string[];
  retestDue: number | null;
  nextRetestDay: string | null;
  fixed: number;
  improving: number;
}

export function trackSummary(track: Track, day: string): TrackSummary {
  const week = weekOf(track, day);
  const progress = errorProgress(track);
  const due = retestDue(track, day);
  const nextWeek = due ?? (week >= 1 && week <= track.weeks ? week : null);
  return {
    week,
    weeks: track.weeks,
    phase: phaseOf(track, Math.max(1, week)),
    daysLeft: Math.max(0, parseDay(addDaysTo(track.startDay, track.weeks * 7)) - parseDay(day)),
    activeErrors: week >= 1 ? activeErrors(track, week) : [],
    retestDue: due,
    nextRetestDay: nextWeek ? retestDay(track, nextWeek) : null,
    fixed: progress.filter((p) => p.status === "fixed").length,
    improving: progress.filter((p) => p.status === "improving").length,
  };
}

/** Parses a stored track, or null when it is not one (an older or corrupt copy is ignored, never half-read). */
export function parseTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Partial<Track>;
  if (t.format !== 1 || typeof t.startDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.startDay)) return null;
  if (!Array.isArray(t.focus) || !t.focus.every((f) => typeof f === "string")) return null;
  const weeks = Number(t.weeks);
  if (!Number.isInteger(weeks) || weeks < TRACK_WEEKS_MIN || weeks > TRACK_WEEKS_MAX) return null;
  return {
    format: 1,
    startDay: t.startDay,
    weeks,
    focus: t.focus.slice(0, MAX_FOCUS + 2),
    baseline: t.baseline && typeof t.baseline === "object" ? (t.baseline as Record<string, number>) : {},
    retests: Array.isArray(t.retests) ? t.retests.filter((r) => r && Number.isInteger(r.week) && typeof r.day === "string" && r.scores && typeof r.scores === "object") : [],
    ownSentences: Array.isArray(t.ownSentences) ? t.ownSentences.filter((s) => s && typeof s.text === "string" && typeof s.id === "string").slice(-OWN_SENTENCES_CAP) : [],
    cards: t.cards && typeof t.cards === "object" ? (t.cards as Record<string, CardState>) : {},
    done: t.done && typeof t.done === "object" ? (t.done as Record<string, string[]>) : {},
    updatedAt: Number(t.updatedAt) || 0,
  };
}

/** The newer of two copies of a track (device and cloud), by updatedAt. */
export function newerTrack(a: Track | null, b: Track | null): Track | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}
