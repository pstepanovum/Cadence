import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { CheckCircle2, Lock } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { getModules } from "@/api/endpoints";
import type { ModuleWithProgress } from "@/api/types";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressBar,
  ProgressRing,
  Screen,
  ScreenState,
  SectionHeader,
  StatTile,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { normalizeScore } from "@/practice/scoring";
import { colors, spacing } from "@/theme/theme";

export default function LearnScreen() {
  const server = useServerStatus();
  const modulesQuery = useQuery({ queryKey: ["modules"], queryFn: getModules });

  const modules = modulesQuery.data ?? [];
  const completed = modules.filter((item) => item.progress?.is_completed).length;
  const unlocked = modules.filter((item) => item.progress?.is_unlocked).length;
  const current = modules.find(
    (item) => item.progress?.is_unlocked && !item.progress?.is_completed,
  );

  return (
    <Screen
      refreshing={modulesQuery.isFetching}
      onRefresh={() => {
        modulesQuery.refetch();
        server.refresh();
      }}>
      {!server.reachable && !server.checking ? (
        <Banner
          tone="error"
          message={server.message ?? "Cadence can't reach the server."}
          actionLabel={server.actionLabel ?? "Try again"}
          onAction={server.refresh}
        />
      ) : null}

      <SectionHeader
        eyebrow="Learn"
        title="Pronunciation modules"
        subtitle="Work through each module and pass its exam to unlock the next one."
      />

      {modules.length > 0 ? (
        <Card variant="dark">
          <Eyebrow onDark>Your route</Eyebrow>
          <Title size={20} onDark>
            {current ? `Module ${current.sort_order}: ${current.title}` : "Every module complete"}
          </Title>
          <View style={styles.statsRow}>
            <StatTile tone="translucent" label="Complete" value={`${completed}/${modules.length}`} />
            <StatTile tone="translucent" label="Unlocked" value={String(unlocked)} />
            <StatTile
              tone="translucent"
              label="Progress"
              value={`${Math.round((completed / modules.length) * 100)}%`}
            />
          </View>
          <ProgressBar value={(completed / modules.length) * 100} onDark />
        </Card>
      ) : null}

      <ScreenState
        isLoading={modulesQuery.isLoading}
        isError={modulesQuery.isError}
        errorMessage={describeError(
          modulesQuery.error,
          server.reachable
            ? "Could not load the modules."
            : "Cadence can't reach the server right now.",
        )}
        onRetry={() => modulesQuery.refetch()}
        isEmpty={modules.length === 0}
        loadingRows={4}
        empty={{
          title: "No modules yet",
          message:
            "The curriculum hasn't been published to this account. Pull down to check again — if it stays empty, the server's module catalogue needs seeding.",
          illustration: ILLUSTRATION_PROGRESS,
          actionLabel: "Check again",
          onAction: () => modulesQuery.refetch(),
        }}>
        {modules.map((module) => (
          <ModuleCard key={module.id} module={module} />
        ))}
      </ScreenState>
    </Screen>
  );
}

function ModuleCard({ module }: { module: ModuleWithProgress }) {
  const unlocked = module.progress?.is_unlocked ?? false;
  const completed = module.progress?.is_completed ?? false;
  const bestScore = module.progress?.best_exam_score ?? null;

  const card = (
    <Card variant={completed ? "dark" : "light"} style={!unlocked ? styles.lockedCard : undefined}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Eyebrow onDark={completed}>Module {module.sort_order}</Eyebrow>
          <Title size={20} onDark={completed}>
            {module.title}
          </Title>
        </View>
        {completed ? (
          <CheckCircle2 color={colors.yellowGreen} size={26} />
        ) : !unlocked ? (
          <Lock color={colors.slate} size={22} />
        ) : bestScore !== null ? (
          <ProgressRing score={normalizeScore(bestScore)} size={56} strokeWidth={5} />
        ) : null}
      </View>

      <Body size={13} onDark={completed}>
        {module.description}
      </Body>

      <View style={styles.focusRow}>
        {module.phoneme_focus.slice(0, 4).map((phoneme) => (
          <Chip key={phoneme} label={phoneme} status={completed ? "correct" : "neutral"} />
        ))}
      </View>

      {!unlocked ? (
        <Banner
          tone="info"
          message={
            module.sort_order === 1
              ? "This module unlocks as soon as your progress finishes syncing. Pull down to refresh."
              : `Pass the exam in module ${module.sort_order - 1} with 70 or higher to unlock this one.`
          }
        />
      ) : (
        <Body size={12} onDark={completed} style={styles.cta}>
          {completed
            ? `Review module · best exam score ${normalizeScore(bestScore ?? 0)}/100`
            : bestScore !== null
              ? `Continue · best exam score ${normalizeScore(bestScore)}/100`
              : "Start module"}
        </Body>
      )}
    </Card>
  );

  if (!unlocked) return card;

  return (
    <Link
      href={{ pathname: "/learn/[moduleId]", params: { moduleId: String(module.id) } }}
      asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${module.title}`}>
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
  cta: {
    fontWeight: "600",
  },
});
