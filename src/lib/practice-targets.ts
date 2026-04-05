// FILE: src/lib/practice-targets.ts
import practiceTargetsData from "@/ai-engine/practice_targets.json";

interface PracticeTargetSegment {
  text: string;
  start: number;
  end: number;
}

interface PracticeTargetRecord {
  ipa: string;
  segments: PracticeTargetSegment[];
}

export interface PracticeTargetOption {
  word: string;
  label: string;
  ipa: string;
  cue: string;
}

const cueOverrides: Record<string, string> = {
  think:
    "Stretch the air through the th, then keep the vowel short and relaxed.",
  three:
    "Start with a soft th, then keep the r light before opening into the long ee.",
  very:
    "Let the lower lip touch lightly for the v, then keep the ending clear and forward.",
};

const practiceTargets = practiceTargetsData as Record<string, PracticeTargetRecord>;

function toLabel(word: string) {
  return word.slice(0, 1).toUpperCase() + word.slice(1);
}

function buildCue(word: string, target: PracticeTargetRecord) {
  const override = cueOverrides[word];

  if (override) {
    return override;
  }

  const focus = target.segments
    .slice(0, 2)
    .map((segment) => segment.text)
    .join(" and ");

  return `Keep ${focus || "the sound"} clean, then compare the full target against /${target.ipa}/.`;
}

export const PRACTICE_TARGET_OPTIONS: PracticeTargetOption[] = Object.entries(
  practiceTargets,
)
  .map(([word, target]) => ({
    word,
    label: toLabel(word),
    ipa: `/${target.ipa}/`,
    cue: buildCue(word, target),
  }))
  .sort((left, right) => left.label.localeCompare(right.label));

export function getPracticeTarget(word: string) {
  return (
    PRACTICE_TARGET_OPTIONS.find(
      (target) => target.word === word.trim().toLowerCase(),
    ) ?? PRACTICE_TARGET_OPTIONS[0]
  );
}
