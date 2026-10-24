import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ChevronRight, Lock } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { getModules } from "@/api/endpoints";
import type { ModuleWithProgress } from "@/api/types";
import { ServerBanner } from "@/components/status";
import {
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressRing,
  Screen,
  pressedCard,
  ScreenState,
  SectionHeader,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { useRefresh } from "@/hooks/useRefresh";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { normalizeScore } from "@/practice/scoring";
import { colors, overlays, spacing, type } from "@/theme/theme";

export default function LearnScreen() {
  const server = useServerStatus();
  const modulesQuery = useQuery({ queryKey: ["modules"], queryFn: getModules });
  const { refreshing, onRefresh } = useRefresh(() => {
    server.refresh();
    return modulesQuery.refetch();
  });

  const modules = modulesQuery.data ?? [];
  const completed = modules.filter((item) => item.progress?.is_completed).length;
  const current = modules.find((item) => item.progress?.is_unlocked && !item.progress?.is_completed);
  // Only the next locked module explains how to open it; the rest just say locked.
  const nextLocked = modules.find((item) => !item.progress?.is_unlocked);
  const percent = modules.length ? Math.round((completed / modules.length) * 100) : 0;

  return (
    <Screen tab refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader
        eyebrow="Learn"
        title="Pronunciation modules"
        subtitle="Pass each module's exam to unlock the next."
      />

      <ServerBanner />

      {modules.length > 0 ? (
        <Card style={styles.route}>
          <ProgressRing score={percent} size={72} strokeWidth={7} label={`${percent}%`} />
          <View style={styles.routeText}>
            <Eyebrow>{current ? "Up next" : "All done"}</Eyebrow>
            <Title size={type.headline} numberOfLines={2}>
              {current ? `Module ${current.sort_order}: ${current.title}` : "Every module complete"}
            </Title>
            <Body size={type.footnote} tone="muted">
              {completed} of {modules.length} complete
            </Body>
          </View>
        </Card>
      ) : null}

      <ScreenState
        isLoading={modulesQuery.isLoading}
        isError={modulesQuery.isError}
        offline={server.offline}
        errorMessage={describeError(modulesQuery.error, "Could not load the modules.")}
        onRetry={() => void modulesQuery.refetch()}
        isEmpty={modules.length === 0}
        loadingRows={4}
        empty={{
          title: "No modules yet",
          message: "Your modules haven't arrived yet. Pull down to check again.",
          illustration: ILLUSTRATION_PROGRESS,
          actionLabel: "Check again",
          onAction: () => void modulesQuery.refetch(),
        }}>
        {modules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            isNext={current?.id === module.id}
            showLockReason={nextLocked?.id === module.id}
          />
        ))}
      </ScreenState>
    </Screen>
  );
}

function ModuleCard({
  module,
  isNext,
  showLockReason,
}: {
  module: ModuleWithProgress;
  isNext: boolean;
  showLockReason: boolean;
}) {
  const unlocked = module.progress?.is_unlocked ?? false;
  const completed = module.progress?.is_completed ?? false;
  const bestScore = module.progress?.best_exam_score ?? null;

  const lockReason =
    module.sort_order === 1
      ? "Unlocks as soon as your progress syncs. Pull down to refresh."
      : `Pass module ${module.sort_order - 1}'s exam with 70 or more.`;

  const card = (
    <Card style={[!unlocked && styles.lockedCard, isNext && styles.nextCard]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Eyebrow>Module {module.sort_order}</Eyebrow>
          <Title size={type.title3}>{module.title}</Title>
        </View>
        {completed ? (
          <Chip label="Passed" status="correct" />
        ) : !unlocked ? (
          <Lock color={colors.slate} size={20} />
        ) : bestScore !== null ? (
          <ProgressRing score={normalizeScore(bestScore)} size={52} strokeWidth={5} />
        ) : isNext ? (
          <Chip label="Next up" status="accent" />
        ) : null}
      </View>

      <Body size={type.callout} numberOfLines={3}>
        {module.description}
      </Body>

      <View style={styles.focusRow}>
        {module.phoneme_focus.slice(0, 4).map((phoneme) => (
          <Chip key={phoneme} label={phoneme} />
        ))}
      </View>

      {unlocked ? (
        <View style={styles.footer}>
          <Body size={type.footnote} weight="semibold" tone="strong" style={styles.footerText}>
            {completed
              ? `Review · best exam ${normalizeScore(bestScore ?? 0)}`
              : bestScore !== null
                ? `Continue · best exam ${normalizeScore(bestScore)}`
                : "Start module"}
          </Body>
          <ChevronRight color={colors.hunter} size={18} />
        </View>
      ) : (
        <Body size={type.footnote} tone="muted">
          {showLockReason ? lockReason : "Locked"}
        </Body>
      )}
    </Card>
  );

  if (!unlocked) {
    return (
      <View accessible accessibilityLabel={`${module.title}. Locked. ${lockReason}`}>
        {card}
      </View>
    );
  }

  return (
    <Link href={{ pathname: "/learn/[moduleId]", params: { moduleId: String(module.id) } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${module.title}`}
        style={({ pressed }) => pressedCard(pressed)}>
        {card}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
  },
  routeText: {
    flex: 1,
    gap: spacing.xxs,
  },
  lockedCard: {
    backgroundColor: overlays.locked,
    boxShadow: undefined,
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
    gap: spacing.xxs,
  },
  focusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.platinum,
    paddingTop: spacing.md,
  },
  footerText: {
    flex: 1,
  },
});
