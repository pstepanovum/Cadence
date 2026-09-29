import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { BookOpen, Flame, MessagesSquare, Shuffle, Sparkles } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { assess, getModules, getStats, type RecordedAudio } from "@/api/endpoints";
import type { PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback } from "@/audio/feedback";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  InfoPanel,
  PillButton,
  ProgressBar,
  Screen,
  SectionHeader,
  StatTile,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { normalizeScore } from "@/practice/scoring";
import { suggestedGroupKey, targetGroups } from "@/practice/targets";
import { colors, fonts, radii, spacing } from "@/theme/theme";

export default function HomeScreen() {
  const { displayName, profile } = useAuth();
  const server = useServerStatus();
  const readiness = useAssessReadiness();

  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const modulesQuery = useQuery({ queryKey: ["modules"], queryFn: getModules });

  const groups = useMemo(() => targetGroups(), []);
  const [groupKey, setGroupKey] = useState(() => {
    const preferred = suggestedGroupKey(profile.practiceFocus);
    return targetGroups().some((group) => group.key === preferred) ? preferred : groups[0]?.key;
  });
  const group = groups.find((item) => item.key === groupKey) ?? groups[0];

  const [wordIndex, setWordIndex] = useState(0);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = group?.targets[Math.min(wordIndex, group.targets.length - 1)];

  async function handleTake(take: RecordedAudio) {
    if (!target) return;
    setError(null);
    try {
      const result = await assess(take, target.word);
      setAssessment(result);
      playAssessmentFeedback(result.overallScore);
    } catch (cause) {
      const message = describeError(cause, "Scoring failed. Try that take again.");
      setError(message);
      throw new Error(message);
    }
  }

  function pickWord(index: number) {
    setWordIndex(index);
    setAssessment(null);
    setError(null);
  }

  function shuffle() {
    if (!group || group.targets.length < 2) return;
    let next = wordIndex;
    while (next === wordIndex) next = Math.floor(Math.random() * group.targets.length);
    pickWord(next);
  }

  const stats = statsQuery.data;
  const modules = modulesQuery.data ?? [];
  const completedModules = modules.filter((item) => item.progress?.is_completed).length;
  const refreshing = statsQuery.isFetching || modulesQuery.isFetching;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        statsQuery.refetch();
        modulesQuery.refetch();
        server.refresh();
        readiness.refresh();
      }}>
      {!server.reachable && !server.checking ? (
        <Banner
          tone="error"
          message={server.message ?? "Cadence can't reach the server."}
          actionLabel={server.actionLabel ?? "Try again"}
          onAction={server.refresh}
        />
      ) : null}

      <Card variant="dark">
        <Eyebrow onDark>Welcome back</Eyebrow>
        <Title size={26} onDark>
          Hi {displayName}, ready to practice?
        </Title>

        {statsQuery.isError ? (
          <Banner
            tone="warning"
            message={describeError(statsQuery.error, "Your stats could not be loaded.")}
            actionLabel="Retry"
            onAction={() => statsQuery.refetch()}
          />
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatTile
                tone="translucent"
                label="Attempts"
                value={stats ? String(stats.total_attempts) : "—"}
              />
              <StatTile
                tone="translucent"
                label="Avg score"
                value={stats ? String(normalizeScore(stats.average_score)) : "—"}
              />
              <StatTile
                tone="translucent"
                label="Modules"
                value={stats ? `${completedModules}/${modules.length || 10}` : "—"}
              />
            </View>

            <View style={styles.streakRow}>
              <Flame
                color={stats && stats.current_streak_days > 0 ? colors.yellowGreen : colors.cream}
                size={20}
              />
              <Body size={13} onDark style={styles.streakText}>
                {!stats
                  ? "Loading your streak…"
                  : stats.current_streak_days > 0
                    ? `${stats.current_streak_days}-day streak. Finish a lesson today to keep it.`
                    : "No streak yet — finish one lesson today to start it."}
              </Body>
            </View>
          </>
        )}
      </Card>

      <View style={styles.shortcutRow}>
        <Shortcut
          label="Modules"
          icon={<BookOpen color={colors.hunter} size={18} />}
          onPress={() => router.push("/learn")}
        />
        <Shortcut
          label="Talk"
          icon={<MessagesSquare color={colors.hunter} size={18} />}
          onPress={() => router.push("/conversation")}
        />
        <Shortcut
          label="Coach"
          icon={<Sparkles color={colors.hunter} size={18} />}
          onPress={() => router.push("/coach")}
        />
      </View>

      <Card>
        <SectionHeader
          eyebrow="Quick practice"
          title="Drill a target word"
          size={20}
          subtitle="Pick a sound family, hear the reference, then record yourself for phoneme-level feedback."
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.groupRow}>
          {groups.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              status={item.key === group?.key ? "correct" : "neutral"}
              onPress={() => {
                setGroupKey(item.key);
                pickWord(0);
              }}
            />
          ))}
        </ScrollView>

        {group ? (
          <Body size={12} style={{ color: colors.slate }}>
            {group.blurb}
          </Body>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.wordRow}>
          {(group?.targets ?? []).map((item, index) => (
            <Pressable
              key={item.word}
              accessibilityRole="button"
              accessibilityState={{ selected: index === wordIndex }}
              onPress={() => pickWord(index)}
              style={[
                styles.wordPill,
                index === wordIndex && { backgroundColor: colors.yellowGreen },
              ]}>
              <Body
                size={13}
                weight="semibold"
                style={{ color: index === wordIndex ? colors.hunter : colors.iron }}>
                {item.word}
              </Body>
            </Pressable>
          ))}
        </ScrollView>

        {target ? (
          <>
            <View style={styles.ipaPanel}>
              <Title size={30}>{target.word}</Title>
              <Body size={16} style={{ fontFamily: fonts.bodyMedium }}>
                {target.ipa}
              </Body>
              <View style={styles.wordMeta}>
                <Body size={11} style={{ color: colors.slate }}>
                  Word {wordIndex + 1} of {group?.targets.length}
                </Body>
              </View>
              <ProgressBar value={((wordIndex + 1) / (group?.targets.length ?? 1)) * 100} />
            </View>

            {!readiness.ready && readiness.message ? (
              <Banner
                tone={readiness.offline ? "error" : "warning"}
                message={readiness.message}
                actionLabel={readiness.offline ? "Try again" : undefined}
                onAction={readiness.offline ? readiness.refresh : undefined}
              />
            ) : null}

            <RecorderPanel
              key={target.word}
              targetText={target.word}
              onTake={handleTake}
              disabled={!readiness.ready}
                />

            {error ? <Banner message={error} tone="error" /> : null}

            {assessment ? (
              <>
                <AssessmentView assessment={assessment} />
                <PillButton
                  label="Next word"
                  variant="secondary"
                  icon={<Shuffle color={colors.hunter} size={16} />}
                  onPress={shuffle}
                />
              </>
            ) : (
              <InfoPanel>
                <Body size={12} style={styles.centerText}>
                  Your score, the words that landed, and a phoneme-by-phoneme breakdown show up
                  here after your first take.
                </Body>
              </InfoPanel>
            )}
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

function Shortcut({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.85 }]}>
      {icon}
      <Body size={12} weight="semibold" style={{ color: colors.hunter }}>
        {label}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  streakText: {
    flex: 1,
  },
  shortcutRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  shortcut: {
    flex: 1,
    borderRadius: radii.card,
    backgroundColor: colors.snow,
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  groupRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  wordRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  wordPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ipaPanel: {
    borderRadius: radii.card,
    backgroundColor: colors.cream,
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    alignSelf: "stretch",
  },
  wordMeta: {
    marginTop: spacing.xs,
  },
  centerText: {
    textAlign: "center",
  },
});
