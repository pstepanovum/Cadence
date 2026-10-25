// The learner's level settings on this phone (docs/PLATFORM.md 7.1): the
// overall CEFR level, optional grammar, vocabulary and pronunciation levels,
// and the placement items already seen, so a retake asks new ones. Kept on
// the phone for everyone; signed in to Cadence cloud they also live on the
// account (the profile), and the newer copy wins. Lessons, quizzes,
// flashcards, the daily plan and the coach read the level from here, so a
// change applies at once. No React context here, so the API layer can read
// the level too; the account sync is useLevelSync in levels.ts.
import { storedValue } from "@/lib/stored-value";
import { DEFAULT_LEVEL_PREFS, LEVEL_INFO, LEVEL_SKILLS, SKILL_TITLES, levelFor, parseLevelPrefs, prefsFromPlacement, withLevel, type LevelPrefs, type LevelSkill } from "@/platform/levels";
import { decodeSeen, encodeSeen } from "@/platform/placement";
import type { CefrLevel } from "@/platform/content-model";

export const levelPrefs = storedValue<LevelPrefs>("cadence.levels.v1", (raw) => parseLevelPrefs(raw) ?? DEFAULT_LEVEL_PREFS, DEFAULT_LEVEL_PREFS);

export const placementSeen = storedValue<string>("cadence.placement.seen.v1", (raw) => (typeof raw === "string" ? encodeSeen(decodeSeen(raw)) : ""), "");

export const useLevelPrefs = levelPrefs.use;

/** The level one skill practises at right now, outside React (API calls). */
export function currentLevel(skill?: LevelSkill): CefrLevel {
  return levelFor(levelPrefs.get(), skill);
}

/** The level one skill practises at right now. */
export function useLevel(skill?: LevelSkill): CefrLevel {
  return levelFor(useLevelPrefs(), skill);
}

export function setOverallLevel(level: CefrLevel): void {
  levelPrefs.set((current) => withLevel(current, { overall: level }, Date.now()));
}

/** A skill's own level, or null to follow the overall level again. */
export function setSkillLevel(skill: LevelSkill, level: CefrLevel | null): void {
  levelPrefs.set((current) => withLevel(current, { skill, level }, Date.now()));
}

export function applyPlacement(level: CefrLevel, skills: Partial<Record<LevelSkill, CefrLevel>>): void {
  levelPrefs.set(prefsFromPlacement(level, skills, Date.now()));
}

/**
 * The level the self-check or the quiz gave in setup. A placement result
 * already saved keeps its per-skill levels; anything else becomes the
 * learner's own choice.
 */
export function adoptStartingLevel(level: CefrLevel): void {
  const current = levelPrefs.get();
  if (current.source === "placement" && current.overall === level) return;
  levelPrefs.set(withLevel(current, { overall: level, source: "self" }, Date.now()));
}

export function rememberSeen(ids: readonly string[]): void {
  placementSeen.set((current) => encodeSeen(new Set([...decodeSeen(current), ...ids])));
}


/** One line for the Settings row, e.g. "C1 Advanced · Pronunciation B2". */
export function levelSummary(prefs: LevelPrefs): string {
  const skills = LEVEL_SKILLS.filter((skill) => prefs.skills[skill]).map((skill) => `${SKILL_TITLES[skill]} ${prefs.skills[skill]}`);
  return [`${prefs.overall} ${LEVEL_INFO[prefs.overall].name}`, ...skills].join(" · ");
}
