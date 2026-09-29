import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { CheckCircle2, Clock3, Lock } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { getConversationModules } from "@/api/endpoints";
import type { ConversationModuleWithProgress } from "@/api/types";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressBar,
  Screen,
  ScreenState,
  SectionHeader,
  StatTile,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_COMMUNICATION } from "@/data/svg";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { nextScenario, scenarioLockReason } from "@/practice/progression";
import { normalizeScore } from "@/practice/scoring";
import { colors, spacing } from "@/theme/theme";

export default function ConversationScreen() {
  const server = useServerStatus();
  const modulesQuery = useQuery({
    queryKey: ["conversation-modules"],
    queryFn: getConversationModules,
  });

  const scenarios = modulesQuery.data ?? [];
  const completed = scenarios.filter((item) => item.isCompleted).length;
  const unlocked = scenarios.filter((item) => item.isUnlocked).length;
  const upNext = nextScenario(scenarios);

  return (
    <Screen refreshing={modulesQuery.isFetching} onRefresh={() => modulesQuery.refetch()}>
      {!server.reachable && !server.checking ? (
        <Banner
          tone="error"
          message={server.message ?? "Cadence can't reach the server."}
          actionLabel={server.actionLabel ?? "Try again"}
          onAction={server.refresh}
        />
      ) : null}

      <SectionHeader
        eyebrow="Conversation"
        title="Guided dialogues"
        subtitle="Short scripted scenarios. Pass one to unlock the next."
      />

      {scenarios.length > 0 ? (
        <Card variant="dark">
          <Eyebrow onDark>Your track</Eyebrow>
          <Title size={20} onDark>
            {upNext ? upNext.title : "Every scenario passed"}
          </Title>
          <View style={styles.statsRow}>
            <StatTile
              tone="translucent"
              label="Passed"
              value={`${completed}/${scenarios.length}`}
            />
            <StatTile tone="translucent" label="Unlocked" value={String(unlocked)} />
            <StatTile
              tone="translucent"
              label="Progress"
              value={`${Math.round((completed / scenarios.length) * 100)}%`}
            />
          </View>
          <ProgressBar value={(completed / scenarios.length) * 100} onDark />
        </Card>
      ) : null}

      <ScreenState
        isLoading={modulesQuery.isLoading}
        isError={modulesQuery.isError}
        errorMessage={describeError(modulesQuery.error, "Could not load the conversations.")}
        onRetry={() => modulesQuery.refetch()}
        isEmpty={scenarios.length === 0}
        loadingRows={4}
        empty={{
          title: "No scenarios yet",
          message:
            "The conversation track hasn't loaded for this account. Pull down to try again.",
          illustration: ILLUSTRATION_COMMUNICATION,
          actionLabel: "Check again",
          onAction: () => modulesQuery.refetch(),
        }}>
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.slug}
            scenario={scenario}
            scenarios={scenarios}
            isNext={upNext?.slug === scenario.slug}
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
}: {
  scenario: ConversationModuleWithProgress;
  scenarios: ConversationModuleWithProgress[];
  isNext: boolean;
}) {
  const locked = !scenario.isUnlocked;
  const completed = scenario.isCompleted;

  const card = (
    <Card
      variant={completed ? "dark" : "light"}
      style={[locked && styles.lockedCard, isNext && styles.nextCard]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Eyebrow onDark={completed}>
            {scenario.level} · {scenario.topic}
          </Eyebrow>
          <Title size={19} onDark={completed}>
            {scenario.title}
          </Title>
        </View>
        {completed ? (
          <CheckCircle2 color={colors.yellowGreen} size={26} />
        ) : locked ? (
          <Lock color={colors.slate} size={22} />
        ) : isNext ? (
          <Chip label="Next up" status="accent" />
        ) : null}
      </View>

      <Body size={13} onDark={completed}>
        {scenario.summary}
      </Body>

      <View style={styles.focusRow}>
        {scenario.focus.slice(0, 3).map((item) => (
          <Chip key={item} label={item} status={completed ? "correct" : "neutral"} />
        ))}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.timeRow}>
          <Clock3 color={completed ? colors.yellowGreen : colors.sage} size={14} />
          <Body size={12} onDark={completed}>
            ~{scenario.estimatedMinutes} min · {scenario.turns.length} turns · pass{" "}
            {scenario.passScore}
          </Body>
        </View>
        {scenario.progress ? (
          <Chip
            label={`Best ${normalizeScore(scenario.progress.bestScore)}`}
            status={scenario.progress.passed ? "correct" : "mixed"}
          />
        ) : null}
      </View>

      {locked ? (
        <Banner
          tone="info"
          message={
            scenarioLockReason(scenarios, scenario.slug) ??
            "Complete the earlier scenarios to unlock this one."
          }
        />
      ) : null}
    </Card>
  );

  if (locked) return card;

  return (
    <Link href={{ pathname: "/conversation/[slug]", params: { slug: scenario.slug } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Start ${scenario.title}`}>
        {card}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  lockedCard: {
    backgroundColor: "rgba(233,236,239,0.7)",
  },
  nextCard: {
    borderWidth: 2,
    borderColor: colors.yellowGreen,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  cardTitleWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  focusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
});
