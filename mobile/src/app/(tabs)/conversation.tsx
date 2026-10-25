import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Clock3, Lock } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { getConversationModules } from "@/api/endpoints";
import type { ConversationModuleWithProgress } from "@/api/types";
import { ServerBanner } from "@/components/status";
import {
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressBar,
  Screen,
  pressedCard,
  ScreenState,
  SectionHeader,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_COMMUNICATION } from "@/data/svg";
import { useRefresh } from "@/hooks/useRefresh";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { nextScenario, scenarioLockReason } from "@/practice/progression";
import { normalizeScore } from "@/practice/scoring";
import { colors, overlays, spacing, type, themed } from "@/theme/theme";

export default function ConversationScreen() {
  const server = useServerStatus();
  const modulesQuery = useQuery({
    queryKey: ["conversation-modules"],
    queryFn: getConversationModules,
  });
  const { refreshing, onRefresh } = useRefresh(() => {
    server.refresh();
    return modulesQuery.refetch();
  });

  const scenarios = modulesQuery.data ?? [];
  const completed = scenarios.filter((item) => item.isCompleted).length;
  const upNext = nextScenario(scenarios);
  const nextLocked = scenarios.find((item) => !item.isUnlocked);

  return (
    <Screen tab refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader
        eyebrow="Talk"
        title="Guided dialogues"
        subtitle="Short scripted scenes. Pass one to unlock the next."
      />

      <ServerBanner />

      {scenarios.length > 0 ? (
        <View style={styles.track}>
          <View style={styles.trackRow}>
            <Body size={type.footnote} weight="semibold" tone="strong">
              {completed} of {scenarios.length} passed
            </Body>
            <Body size={type.footnote} tone="muted">
              {Math.round((completed / scenarios.length) * 100)}%
            </Body>
          </View>
          <ProgressBar value={(completed / scenarios.length) * 100} />
        </View>
      ) : null}

      <ScreenState
        isLoading={modulesQuery.isLoading}
        isError={modulesQuery.isError}
        offline={server.offline}
        errorMessage={describeError(modulesQuery.error, "Could not load the conversations.")}
        onRetry={() => void modulesQuery.refetch()}
        isEmpty={scenarios.length === 0}
        loadingRows={4}
        empty={{
          title: "No scenarios yet",
          message: "The dialogues haven't loaded. Pull down to try again.",
          illustration: ILLUSTRATION_COMMUNICATION,
          actionLabel: "Check again",
          onAction: () => void modulesQuery.refetch(),
        }}>
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.slug}
            scenario={scenario}
            scenarios={scenarios}
            isNext={upNext?.slug === scenario.slug}
            showLockReason={nextLocked?.slug === scenario.slug}
          />
        ))}
      </ScreenState>
    </Screen>
  );
}

function ScenarioCard({
  scenario,
  scenarios,
  isNext,
  showLockReason,
}: {
  scenario: ConversationModuleWithProgress;
  scenarios: ConversationModuleWithProgress[];
  isNext: boolean;
  showLockReason: boolean;
}) {
  const locked = !scenario.isUnlocked;
  const completed = scenario.isCompleted;
  const reason =
    scenarioLockReason(scenarios, scenario.slug) ?? "Pass the earlier scenes to unlock this one.";

  const card = (
    <Card style={[locked && styles.lockedCard]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Eyebrow>
            {scenario.level} · {scenario.topic}
          </Eyebrow>
          <Title size={type.title3}>{scenario.title}</Title>
        </View>
        {completed ? (
          <Chip label="Passed" status="correct" />
        ) : locked ? (
          <Lock color={colors.slate} size={20} />
        ) : isNext ? (
          <Chip label="Next up" status="accent" />
        ) : null}
      </View>

      <Body size={type.callout} numberOfLines={3}>
        {scenario.summary}
      </Body>

      <View style={styles.focusRow}>
        {scenario.focus.slice(0, 3).map((item) => (
          <Chip key={item} label={item} />
        ))}
      </View>

      {locked ? (
        <Body size={type.footnote} tone="muted">
          {showLockReason ? reason : "Locked"}
        </Body>
      ) : (
        <View style={styles.metaRow}>
          <View style={styles.timeRow}>
            <Clock3 color={colors.slate} size={14} />
            <Body size={type.footnote} tone="muted">
              ~{scenario.estimatedMinutes} min · {scenario.turns.length} turns · pass {scenario.passScore}
            </Body>
          </View>
          {scenario.progress ? (
            <Chip
              label={`Best ${normalizeScore(scenario.progress.bestScore)}`}
              status={scenario.progress.passed ? "correct" : "mixed"}
            />
          ) : null}
        </View>
      )}
    </Card>
  );

  if (locked) {
    return (
      <View accessible accessibilityLabel={`${scenario.title}. Locked. ${reason}`}>
        {card}
      </View>
    );
  }

  return (
    <Link href={{ pathname: "/conversation/[slug]", params: { slug: scenario.slug } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start ${scenario.title}`}
        style={({ pressed }) => pressedCard(pressed)}>
        {card}
      </Pressable>
    </Link>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    track: {
      gap: spacing.sm,
    },
    trackRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    lockedCard: {
      backgroundColor: overlays.locked,
      boxShadow: undefined,
    },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    cardTitleWrap: {
      flex: 1,
      gap: spacing.xxs,
    },
    focusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.sm,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      flexShrink: 1,
    },
  }),
);
