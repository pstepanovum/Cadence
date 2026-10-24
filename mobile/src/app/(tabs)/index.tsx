import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Flame, Shuffle, UserRound } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { assess, getModules, getStats, type RecordedAudio } from "@/api/endpoints";
import type { PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback } from "@/audio/feedback";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import { ReadinessBanner, ServerBanner } from "@/components/status";
import {
  Banner,
  Body,
  Button,
  buttonIconColor,
  Card,
  Chip,
  HorizontalPicker,
  RoundIconButton,
  Screen,
  SectionHeader,
  StatRow,
  StatTile,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { useRefresh } from "@/hooks/useRefresh";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { useConnection } from "@/pairing/context";
import { normalizeScore } from "@/practice/scoring";
import { suggestedGroupKey, targetGroups } from "@/practice/targets";
import { colors, fonts, overlays, radii, spacing, type } from "@/theme/theme";

export default function HomeScreen() {
  const { displayName, profile } = useAuth();
  const { mode } = useConnection();
  const server = useServerStatus();
  const readiness = useAssessReadiness();

  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const modulesQuery = useQuery({ queryKey: ["modules"], queryFn: getModules });

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
    return Promise.all([statsQuery.refetch(), modulesQuery.refetch()]);
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

  const stats = statsQuery.data;
  const modules = modulesQuery.data ?? [];
  const completedModules = modules.filter((item) => item.progress?.is_completed).length;
  const streak = stats?.current_streak_days ?? 0;
  // Local mode has no account, and so no name worth greeting.
  const greeting = mode === "local" ? "Ready to practise?" : `Hi ${displayName}`;

  return (
    <Screen tab refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader
        eyebrow="Welcome back"
        title={greeting}
        trailing={
          <RoundIconButton
            accessibilityLabel="Profile and settings"
            onPress={() => router.push("/profile")}>
            <UserRound color={colors.hunter} size={20} />
          </RoundIconButton>
        }
      />

      <ServerBanner />

      <Card variant="dark">
        {statsQuery.isError && !server.offline ? (
          <Banner
            tone="warning"
            message={describeError(statsQuery.error, "Your stats could not be loaded.")}
            actionLabel="Retry"
            onAction={() => void statsQuery.refetch()}
          />
        ) : (
          <>
            <View style={styles.streakRow}>
              <View style={styles.streakIcon}>
                <Flame color={streak > 0 ? colors.yellowGreen : colors.lime} size={20} />
              </View>
              <View style={styles.streakText}>
                <Title size={type.headline} onDark>
                  {!stats
                    ? server.offline
                      ? "Streak unavailable"
                      : "Loading your streak…"
                    : streak > 0 ? `${streak}-day streak` : "No streak yet"}
                </Title>
                <Body size={type.footnote} onDark tone="muted">
                  {!stats && server.offline
                    ? "It shows up once Cadence is connected."
                    : streak > 0
                      ? "Finish a lesson today to keep it."
                      : "Finish one lesson today to start one."}
                </Body>
              </View>
            </View>
            <StatRow>
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
                value={stats && modules.length > 0 ? `${completedModules}/${modules.length}` : "—"}
              />
            </StatRow>
          </>
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Quick drill"
          title="Practise one sound"
          size={type.title3}
          subtitle="Pick a sound and a word, hear it, then say it."
        />

        <HorizontalPicker
          bleed={spacing.xl}
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

        <HorizontalPicker key={group?.key} bleed={spacing.xl} selectedIndex={wordIndex}>
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
              <Body size={type.headline} style={styles.ipa}>
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
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  streakIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: overlays.whiteOnGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  streakText: {
    flex: 1,
    gap: spacing.xxs,
  },
  wordPanel: {
    borderRadius: radii.panel,
    backgroundColor: colors.cream,
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  ipa: {
    fontFamily: fonts.bodyMedium,
  },
});
