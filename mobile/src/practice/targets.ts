import { PRACTICE_TARGETS, type PracticeTarget } from "@/data/practice-targets";

// The drill list is 100+ words across nine phoneme families. Shown as one flat
// row it is unusable, so quick practice groups it and lets the learner pick a
// family first.

export interface TargetGroup {
  key: string;
  label: string;
  /** One line explaining what this family is for. */
  blurb: string;
  targets: PracticeTarget[];
}

const GROUP_META: Record<string, { label: string; blurb: string }> = {
  th_voiceless: {
    label: "Voiceless TH",
    blurb: "“think”, “three” — tongue between the teeth, no voice.",
  },
  th_voiced: {
    label: "Voiced TH",
    blurb: "“this”, “other” — same tongue position, with voice.",
  },
  r_l_distinction: {
    label: "R vs L",
    blurb: "Keep “right” and “light” apart.",
  },
  v_w_distinction: {
    label: "V vs W",
    blurb: "“vine” bites the lip, “wine” rounds it.",
  },
  short_vowels: {
    label: "Short vowels",
    blurb: "The quick ones: bat, bed, bit, hot.",
  },
  long_vowels: {
    label: "Long vowels",
    blurb: "Held and steady: beat, food, calm.",
  },
  diphthongs: {
    label: "Diphthongs",
    blurb: "Two vowels in one glide: face, house, boy.",
  },
  schwa_unstressed: {
    label: "Schwa",
    blurb: "The unstressed “uh” that carries English rhythm.",
  },
  consonant_clusters: {
    label: "Clusters",
    blurb: "Consonants stacked together without an extra vowel.",
  },
};

function titleCase(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Groups the drill list by phoneme family, in the order the data defines. */
export function targetGroups(targets: readonly PracticeTarget[] = PRACTICE_TARGETS): TargetGroup[] {
  const groups = new Map<string, TargetGroup>();
  for (const target of targets) {
    let group = groups.get(target.category);
    if (!group) {
      const meta = GROUP_META[target.category];
      group = {
        key: target.category,
        label: meta?.label ?? titleCase(target.category),
        blurb: meta?.blurb ?? "Targets in this family.",
        targets: [],
      };
      groups.set(target.category, group);
    }
    group.targets.push(target);
  }
  return [...groups.values()];
}

/**
 * The family a learner should warm up with, given what they told onboarding.
 * Nothing here is binding — it only decides which group is open on arrival.
 */
export function suggestedGroupKey(focus: string): string {
  switch (focus) {
    case "vowels":
      return "short_vowels";
    case "work":
      return "consonant_clusters";
    case "daily":
      return "schwa_unstressed";
    default:
      return "th_voiceless";
  }
}
