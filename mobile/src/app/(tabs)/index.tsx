import { router } from "expo-router";
import { Flame, Shuffle, UserRound } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { assess, type RecordedAudio } from "@/api/endpoints";
import type { PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback } from "@/audio/feedback";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import { ReadinessBanner, ServerBanner } from "@/components/status";
import { UpdateBanner } from "@/components/UpdateNotice";
import {
  Body,
  Button,
  buttonIconColor,
  Card,
  Chip,
  Eyebrow,
  HorizontalPicker,
  ProgressRing,
  RoundIconButton,
  Screen,
  SectionHeader,
  StatRow,
  StatTile,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { earnedCount } from "@/engagement/badges";
import { useBadges, useToday } from "@/engagement/useEngagement";
import { wordOfTheDay } from "@/lib/widget/snapshot";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { useRefresh } from "@/hooks/useRefresh";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { useConnection } from "@/pairing/context";
import { suggestedGroupKey, targetGroups } from "@/practice/targets";
import { colors, fonts, radii, spacing, type, themed } from "@/theme/theme";

export default function HomeScreen() {
  const { displayName, profile } = useAuth();
  const { mode } = useConnection();
  const server = useServerStatus();
  const readiness = useAssessReadiness();

  const today = useToday();
  const badges = useBadges();
  const word = wordOfTheDay(today.today);

  const groups = useMemo(() => targetGroups(), []);
  const [groupKey, setGroupKey] = useState(() => {
    const preferred = suggestedGroupKey(profile.practiceFocus);
    return groups.some((group) => group.key === preferred) ? preferred : groups[0]?.key;
  });
  const group = groups.find((item) => item.key === groupKey) ?? groups[0];

  const [wordIndex, setWordIndex] = useState(0);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);

  const target = group?.targets[Math.min(wordIndex, group.targets.length - 1)];

  const { refreshing, onRefresh } = useRefresh(() => {
    server.refresh();
    readiness.refresh();
    return Promise.resolve();
  });

  async function handleTake(take: RecordedAudio) {
    if (!target) return;
    try {
      const result = await assess(take, target.word);
      setAssessment(result);
      playAssessmentFeedback(result.overallScore);
    } catch (cause) {
      // The recorder's status line shows this; it is the only place it appears.
      throw new Error(describeError(cause, "Scoring failed. Try that take again."));
    }
  }

  function pickWord(index: number) {
    setWordIndex(index);
    setAssessment(null);
  }

  function shuffle() {
    if (!group || group.targets.length < 2) return;
    let next = wordIndex;
    while (next === wordIndex) next = Math.floor(Math.random() * group.targets.length);
    pickWord(next);
  }

  const streak = today.streak.current;
  const streakTitle = streak > 0 ? `${streak}-day streak` : "Start a streak today";
  // Local mode has no account, and so no name worth greeting.
  const greeting = mode === "local" ? "Ready to practise?" : `Hi ${displayName}`;

  return (
    <Screen tab refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader
        eyebrow={today.streak.current > 0 ? "Welcome back" : "Today"}
        title={greeting}
        trailing={
          <RoundIconButton
            accessibilityLabel="Profile and settings"
            onPress={() => router.push("/profile")}>
            <UserRound color={colors.carbon} size={20} />
          </RoundIconButton>
        }
      />

      <UpdateBanner />
      <ServerBanner />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${streakTitle}. ${today.minutesToday} of ${today.goalMinutes} minutes today. Open streak and badges`}
        style={({ pressed }) => [styles.today, pressed && styles.pressed]}
        onPress={() => router.push("/badges")}>
        <View style={styles.streakRow}>
          <ProgressRing score={today.goalProgress * 100} size={64} strokeWidth={6} label={`${today.minutesToday}/${today.goalMinutes}`} color={colors.hunter} />
          <View style={styles.streakText}>
            <View style={styles.flameRow}>
              <Flame color={streak > 0 ? colors.hunter : colors.slate} size={18} />
              <Title size={type.headline}>{streakTitle}</Title>
            </View>
            <Body size={type.footnote} tone="muted">
              {today.goalMet
                ? "Today's goal is done."
                : streak > 0 && !today.streak.practisedToday
                  ? today.streak.freezes > 0
                    ? "Practise today to keep it. A freeze covers you if not."
                    : "Practise today to keep it going."
                  : `${today.goalMinutes - today.minutesToday} minutes to today's goal.`}
            </Body>
          </View>
        </View>
        <StatRow>
          <StatTile label="Best streak" value={String(today.streak.best)} />
          <StatTile label="This week" value={`${today.weekMinutes} min`} />
          <StatTile label="Badges" value={String(earnedCount(badges))} />
        </StatRow>
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel={`Word of the day: ${word.word}. Practise it`} onPress={() => router.push({ pathname: "/word/[wordId]", params: { wordId: word.id } })}>
        <Card>
          <Eyebrow>Word of the day</Eyebrow>
          <View style={styles.wordRow}>
            <Title size={type.title2}>{word.word}</Title>
            <Body size={type.callout} tone="muted" style={styles.ipa}>
              {word.ipa}
            </Body>
          </View>
          <Body size={type.footnote} tone="muted" numberOfLines={2}>
            {word.definition}
          </Body>
        </Card>
      </Pressable>

      <View style={styles.drill}>
        <SectionHeader
          eyebrow="Quick drill"
          title="Practise one sound"
          size={type.title3}
          subtitle="Pick a sound and a word, hear it, then say it."
        />

        <HorizontalPicker
          bleed={spacing.lg}
          selectedIndex={Math.max(0, groups.findIndex((item) => item.key === group?.key))}>
          {groups.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={item.key === group?.key}
              onPress={() => {
                setGroupKey(item.key);
                pickWord(0);
              }}
            />
          ))}
        </HorizontalPicker>

        {group ? (
          <Body size={type.footnote} tone="muted">
            {group.blurb}
          </Body>
        ) : null}

        <HorizontalPicker key={group?.key} bleed={spacing.lg} selectedIndex={wordIndex}>
          {(group?.targets ?? []).map((item, index) => (
            <Chip
              key={item.word}
              label={item.word}
              selected={index === wordIndex}
              onPress={() => pickWord(index)}
            />
          ))}
        </HorizontalPicker>

        {target ? (
          <>
            <View style={styles.wordPanel}>
              <Title size={type.display}>{target.word}</Title>
              <Body size={type.headline} tone="muted" style={styles.ipa}>
                {target.ipa}
              </Body>
            </View>

            {server.reachable ? <ReadinessBanner readiness={readiness} /> : null}

            <RecorderPanel
              key={target.word}
              targetText={target.word}
              onTake={handleTake}
              disabled={!readiness.ready}
            />

            {assessment ? (
              <>
                <AssessmentView assessment={assessment} />
                <Button
                  label="Another word"
                  variant="secondary"
                  icon={<Shuffle color={buttonIconColor("secondary")} size={16} />}
                  onPress={shuffle}
                />
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    today: { gap: spacing.md },
    pressed: { opacity: 0.85 },
    drill: { gap: spacing.md },
    streakRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    flameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    wordRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: spacing.sm },
    streakText: {
      flex: 1,
      gap: spacing.xxs,
    },
    wordPanel: {
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      alignItems: "center",
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      gap: spacing.xs,
    },
    ipa: {
      fontFamily: fonts.bodyMedium,
    },
  }),
);
