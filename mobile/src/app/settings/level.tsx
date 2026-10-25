// Settings > Level: the learner's overall CEFR level, optional grammar,
// vocabulary and pronunciation levels, and a retake of the placement test.
// Lessons, quizzes, flashcards, today's plan and the coach follow a change at
// once; every other level stays open in Learn. Kept on the phone, and on the
// account when signed in (src/learning/levels.ts).
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ChoiceCard } from "@/components/onboarding/ChoiceCard";
import { Body, Button, Eyebrow, OptionRow, Screen, TopBar } from "@/components/ui";
import { setOverallLevel, setSkillLevel, useLevelPrefs } from "@/learning/level-store";
import { CEFR_LEVELS, type CefrLevel } from "@/platform/content-model";
import { LEVELS_ADVANCED_FIRST, LEVEL_INFO, LEVEL_SKILLS, SKILL_TITLES, examLine, type LevelSkill } from "@/platform/levels";
import { spacing, type } from "@/theme/theme";

type SkillChoice = "same" | CefrLevel;
const SKILL_OPTIONS: readonly { value: SkillChoice; label: string }[] = [{ value: "same", label: "Same" }, ...[...CEFR_LEVELS].reverse().map((level) => ({ value: level, label: level }))];

const SOURCE_TEXT = { default: "Not set yet: Cadence starts at B2.", self: "Set by you.", placement: "Set by the placement test." } as const;

export default function LevelSettingsScreen() {
  const prefs = useLevelPrefs();

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Settings" title="Level" />
      <Body size={type.callout} tone="muted">
        {`Lessons, quizzes, flashcards, today's plan and the coach use this level. Other levels stay open in Learn. ${SOURCE_TEXT[prefs.source]}`}
      </Body>

      <View style={styles.section}>
        <Eyebrow>Overall</Eyebrow>
        <View accessibilityRole="radiogroup" style={styles.choices}>
          {LEVELS_ADVANCED_FIRST.map((level) => (
            <ChoiceCard
              key={level}
              title={`${level} · ${LEVEL_INFO[level].name}`}
              detail={`${LEVEL_INFO[level].detail} ${examLine(level)}`}
              selected={prefs.overall === level}
              onPress={() => setOverallLevel(level)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Eyebrow>By skill</Eyebrow>
        <Body size={type.footnote} tone="muted">
          Optional. A skill set to Same follows the overall level.
        </Body>
        {LEVEL_SKILLS.map((skill: LevelSkill) => (
          <OptionRow<SkillChoice>
            key={skill}
            label={SKILL_TITLES[skill]}
            options={SKILL_OPTIONS}
            value={prefs.skills[skill] ?? "same"}
            onChange={(choice) => setSkillLevel(skill, choice === "same" ? null : choice)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Eyebrow>Placement test</Eyebrow>
        <Body size={type.footnote} tone="muted">
          Adaptive, 12 to 24 questions, about five minutes. New questions each time.
        </Body>
        <Button label="Retake placement" variant="secondary" onPress={() => router.push("/settings/placement")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  choices: { gap: spacing.xs },
});
