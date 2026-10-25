// FILE: src/lib/platform/levels.ts
//
// The six CEFR levels as the learner sees them (a short description and the
// approximate IELTS and TOEFL iBT equivalents, docs/PLATFORM.md section 7.1)
// and the learner's level settings: one overall level, optional per-skill
// levels for grammar, vocabulary and pronunciation, and where the level came
// from. Pure, so the phone, the web and the server read a setting the same way.
//
// Twin: mobile/src/platform/levels.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import { CEFR_LEVELS, isCefrLevel, type CefrLevel } from "./content-model.ts";

/** What each level means, in a line, and its approximate exam equivalents. */
export interface LevelInfo {
  level: CefrLevel;
  name: string;
  detail: string;
  /** IELTS overall band, approximate; null where IELTS does not report the level. */
  ielts: string | null;
  /** TOEFL iBT total (0 to 120), approximate. */
  toefl: string;
}

/**
 * Exam equivalents from the publishers' own CEFR mappings (sources in
 * docs/PLATFORM.md 7.1). They are approximate: a CEFR level is a band, and the
 * exams test different things in different ways.
 */
export const LEVEL_INFO: Readonly<Record<CefrLevel, LevelInfo>> = {
  A1: { level: "A1", name: "Beginner", detail: "Basic phrases and simple facts.", ielts: null, toefl: "below 42" },
  A2: { level: "A2", name: "Elementary", detail: "Routine exchanges on familiar topics.", ielts: "below 4.0", toefl: "below 42" },
  B1: { level: "B1", name: "Intermediate", detail: "Most everyday situations and simple connected text.", ielts: "4.0 to 5.0", toefl: "42 to 71" },
  B2: { level: "B2", name: "Upper intermediate", detail: "Clear, detailed argument on abstract topics.", ielts: "5.5 to 6.5", toefl: "72 to 94" },
  C1: { level: "C1", name: "Advanced", detail: "Fluent, precise English for work and study.", ielts: "7.0 to 8.0", toefl: "95 to 113" },
  C2: { level: "C2", name: "Proficient", detail: "Nuance, register and precision at will.", ielts: "8.5 to 9.0", toefl: "114 to 120" },
};

/** The levels in the order they are offered: advanced first. */
export const LEVELS_ADVANCED_FIRST: readonly CefrLevel[] = [...CEFR_LEVELS].reverse();

/** The short exam line shown under a level, e.g. "IELTS 7.0 to 8.0 · TOEFL 95 to 113 (approx.)". */
export function examLine(level: CefrLevel): string {
  const info = LEVEL_INFO[level];
  const parts = [info.ielts ? `IELTS ${info.ielts}` : null, `TOEFL iBT ${info.toefl}`].filter(Boolean);
  return `${parts.join(" · ")} (approx.)`;
}

/** Where a level starts when nothing is known: Cadence is built for advanced learners. */
export const DEFAULT_LEVEL: CefrLevel = "B2";

export const LEVEL_SKILLS = ["grammar", "vocabulary", "pronunciation"] as const;
export type LevelSkill = (typeof LEVEL_SKILLS)[number];

export const SKILL_TITLES: Readonly<Record<LevelSkill, string>> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
};

export type LevelSource = "default" | "self" | "placement";

/** The learner's level settings. */
export interface LevelPrefs {
  overall: CefrLevel;
  /** Set only where the learner (or the placement test) chose a level that differs from the overall one. */
  skills: Partial<Record<LevelSkill, CefrLevel>>;
  source: LevelSource;
  /** Milliseconds since the epoch; the newer of two copies wins. */
  updatedAt: number;
}

export const DEFAULT_LEVEL_PREFS: LevelPrefs = { overall: DEFAULT_LEVEL, skills: {}, source: "default", updatedAt: 0 };

/** A stored or posted value as level settings, or null when it is not one. */
export function parseLevelPrefs(raw: unknown): LevelPrefs | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isCefrLevel(o.overall)) return null;
  const skills: Partial<Record<LevelSkill, CefrLevel>> = {};
  const rawSkills = typeof o.skills === "object" && o.skills !== null ? (o.skills as Record<string, unknown>) : {};
  for (const skill of LEVEL_SKILLS) {
    const value = rawSkills[skill];
    if (isCefrLevel(value) && value !== o.overall) skills[skill] = value;
  }
  const source: LevelSource = o.source === "self" || o.source === "placement" ? o.source : "default";
  const updatedAt = typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt) && o.updatedAt >= 0 ? Math.floor(o.updatedAt) : 0;
  return { overall: o.overall, skills, source, updatedAt };
}

/** The level a skill practises at: its own setting, else the overall level. */
export function levelFor(prefs: LevelPrefs, skill?: LevelSkill): CefrLevel {
  return (skill ? prefs.skills[skill] : undefined) ?? prefs.overall;
}

/** New settings with one change applied, dated now. A skill set to the overall level follows it again. */
export function withLevel(prefs: LevelPrefs, change: { overall?: CefrLevel; skill?: LevelSkill; level?: CefrLevel | null; source?: LevelSource }, now: number): LevelPrefs {
  const overall = change.overall ?? prefs.overall;
  const skills: Partial<Record<LevelSkill, CefrLevel>> = { ...prefs.skills };
  if (change.skill) {
    if (change.level && change.level !== overall) skills[change.skill] = change.level;
    else delete skills[change.skill];
  }
  for (const skill of LEVEL_SKILLS) if (skills[skill] === overall) delete skills[skill];
  return { overall, skills, source: change.source ?? (change.overall || change.skill ? "self" : prefs.source), updatedAt: now };
}

/** Two copies (the device and the account): the newer one wins. */
export function newerLevelPrefs(a: LevelPrefs | null, b: LevelPrefs | null): LevelPrefs | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/** Settings from a placement result: the overall level and any skill that came out different. */
export function prefsFromPlacement(level: CefrLevel, skills: Partial<Record<LevelSkill, CefrLevel>>, now: number): LevelPrefs {
  const kept: Partial<Record<LevelSkill, CefrLevel>> = {};
  for (const skill of LEVEL_SKILLS) {
    const value = skills[skill];
    if (value && value !== level) kept[skill] = value;
  }
  return { overall: level, skills: kept, source: "placement", updatedAt: now };
}
