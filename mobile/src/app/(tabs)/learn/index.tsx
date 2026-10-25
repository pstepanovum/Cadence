// The Learn hub: pick a level, then practise (quiz, matching, grammar
// builder, sentence practice, flashcards), work through lessons, look up
// grammar, or open the sounds library, the pronunciation modules and the
// advanced practice (phrase bank, slang, the plateau track).
// Everything here runs from the content packs on the phone, with no AI and
// no network.
import { Link, router, useFocusEffect } from "expo-router";
import { BookOpenText, Brain, Check, ChevronRight, Layers, ListChecks, Mic, Mountain, Puzzle, Shapes, Smile } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  Body,
  Card,
  Chip,
  EmptyState,
  Eyebrow,
  HorizontalPicker,
  LoadingBlock,
  pressedCard,
  Screen,
  SectionHeader,
  Title,
} from "@/components/ui";
import { countForMode, PRACTICE_MODES, type PracticeMode } from "@/content/catalog";
import { BUNDLED_SOURCE } from "@/content/packs";
import { useLearnLevel, useLevelPack } from "@/content/useContent";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { deckFor, deckSummary } from "@/learning/deck";
import { useLearning } from "@/learning/store";
import { CEFR_LEVELS, type CefrLevel } from "@/platform/content-model";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

const MODE_ICONS: Record<PracticeMode, React.ComponentType<{ color: string; size: number }>> = {
  quiz: ListChecks,
  matching: Shapes,
  builder: Puzzle,
  sentences: Brain,
  flashcards: Layers,
};

const MODE_BLURBS: Record<PracticeMode, string> = {
  quiz: "Mixed questions",
  matching: "Pair them up",
  builder: "Build sentences",
  sentences: "Rewrite and type",
  flashcards: "Spaced review",
};

export default function LearnHub() {
  const [level, setLevel] = useLearnLevel();
  const pack = useLevelPack(level);
  const { state } = useLearning();
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));

  const content = pack.content;
  const deck = useMemo(() => deckFor(content, state, level), [content, state, level]);
  const cards = useMemo(() => deckSummary(deck, state, now), [deck, state, now]);

  return (
    <Screen tab>
      <SectionHeader eyebrow="Learn" title="Learn English" subtitle="Grammar, practice and sounds, by level." />

      <HorizontalPicker selectedIndex={CEFR_LEVELS.indexOf(level)}>
        {CEFR_LEVELS.map((item) => (
          <Chip key={item} label={item} selected={item === level} onPress={() => setLevel(item)} accessibilityHint={`Shows ${item} lessons and practice.`} />
        ))}
      </HorizontalPicker>

      {BUNDLED_SOURCE === "fixture" ? (
        <Body size={type.caption} tone="muted">
          Sample lessons for now. The full course arrives with a content update.
        </Body>
      ) : null}

      {pack.isLoading ? (
        <LoadingBlock rows={3} label="Opening this level…" />
      ) : !pack.installed || !content ? (
        <NotOnPhone level={level} />
      ) : (
        <>
          <View style={styles.grid}>
            {(Object.keys(PRACTICE_MODES) as PracticeMode[]).map((mode) => {
              const count = mode === "flashcards" ? deck.length : countForMode(content, mode);
              const detail = mode === "flashcards" ? (cards.dueToday > 0 ? `${cards.dueToday} due today` : cards.new > 0 ? `${cards.new} new` : count ? "Nothing due" : "No cards yet") : count ? MODE_BLURBS[mode] : "None at this level yet";
              return <ModeTile key={mode} mode={mode} level={level} detail={detail} disabled={count === 0} />;
            })}
          </View>

          <View style={styles.section}>
            <Eyebrow>Lessons</Eyebrow>
            {content.lessons.length === 0 ? (
              <EmptyState compact title="No lessons at this level yet" message="Try the practice above, or pick another level." illustration={ILLUSTRATION_PROGRESS} />
            ) : (
              content.lessons.map((lesson) => {
                const record = state.lessons[lesson.id];
                return (
                  <Link key={lesson.id} href={{ pathname: "/practice/lesson/[lessonId]", params: { lessonId: lesson.id, level } }} asChild>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${lesson.title}. ${lesson.minutes} minutes.${record ? " Done." : ""}`} style={({ pressed }) => pressedCard(pressed)}>
                      <Card style={styles.lesson}>
                        <View style={styles.lessonText}>
                          <Title size={type.headline}>{lesson.title}</Title>
                          <Body size={type.footnote} tone="muted" numberOfLines={2}>
                            {lesson.goal}
                          </Body>
                          <Body size={type.caption} tone="muted">
                            {`${lesson.minutes} min · ${lesson.exerciseIds.length} exercises${record ? ` · best ${record.bestScore}` : ""}`}
                          </Body>
                        </View>
                        {record ? (
                          <View style={styles.done}>
                            <Check color={colors.snow} size={16} strokeWidth={3} />
                          </View>
                        ) : (
                          <ChevronRight color={colors.slate} size={20} />
                        )}
                      </Card>
                    </Pressable>
                  </Link>
                );
              })
            )}
          </View>
        </>
      )}

      <View style={styles.section}>
        <Eyebrow>More</Eyebrow>
        <HubRow icon={<Mountain color={colors.carbon} size={20} />} title="Phrases, slang and the plateau" detail="Learn phrases, not words; current slang; twelve weeks on the errors that persist." onPress={() => router.push("/advanced")} />
        <HubRow icon={<BookOpenText color={colors.carbon} size={20} />} title="Grammar reference" detail={`Every ${level} grammar point, with examples and common mistakes.`} onPress={() => router.push({ pathname: "/grammar", params: { level } })} />
        <HubRow icon={<Smile color={colors.carbon} size={20} />} title="Sounds and the mouth map" detail="See where the tongue and lips go for every English sound." onPress={() => router.push("/sounds")} />
        <HubRow icon={<Mic color={colors.carbon} size={20} />} title="Pronunciation modules" detail="Theory, practice and exams, scored by your voice." onPress={() => router.push("/learn/modules")} />
      </View>
    </Screen>
  );
}

function NotOnPhone({ level }: { level: CefrLevel }) {
  return (
    <EmptyState
      title={`${level} isn't on this phone yet`}
      message="Download it once and it works offline from then on."
      illustration={ILLUSTRATION_PROGRESS}
      actionLabel="Get content packs"
      onAction={() => router.push("/settings/packs")}
    />
  );
}

function ModeTile({ mode, level, detail, disabled }: { mode: PracticeMode; level: CefrLevel; detail: string; disabled: boolean }) {
  const Icon = MODE_ICONS[mode];
  const title = PRACTICE_MODES[mode].title;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => router.push({ pathname: "/practice/[mode]", params: { mode, level } })}
      style={({ pressed }) => [styles.tile, disabled && styles.tileDisabled, pressedCard(pressed)]}>
      <View style={styles.tileIcon}>
        <Icon color={colors.carbon} size={20} />
      </View>
      <Title size={type.headline}>{title}</Title>
      <Body size={type.caption} tone="muted">
        {detail}
      </Body>
    </Pressable>
  );
}

function HubRow({ icon, title, detail, onPress }: { icon: React.ReactNode; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} onPress={onPress} style={({ pressed }) => [styles.row, pressedCard(pressed)]}>
      <View style={styles.tileIcon}>{icon}</View>
      <View style={styles.lessonText}>
        <Title size={type.headline}>{title}</Title>
        <Body size={type.footnote} tone="muted" numberOfLines={2}>
          {detail}
        </Body>
      </View>
      <ChevronRight color={colors.slate} size={20} />
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    tile: {
      flexGrow: 1,
      flexBasis: "45%",
      minHeight: 112,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.lg,
      gap: spacing.xs,
      boxShadow: shadows.card,
    },
    tileDisabled: { opacity: 0.55 },
    tileIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.panel,
      backgroundColor: colors.platinum,
      alignItems: "center",
      justifyContent: "center",
    },
    section: { gap: spacing.sm },
    lesson: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
    lessonText: { flex: 1, gap: spacing.xxs },
    done: { width: 28, height: 28, borderRadius: radii.pill, backgroundColor: colors.hunter, alignItems: "center", justifyContent: "center" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.lg,
      minHeight: 72,
      boxShadow: shadows.card,
    },
  }),
);
