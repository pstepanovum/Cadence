import { useQuery } from "@tanstack/react-query";
import { Link, router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, BookOpenText, GraduationCap, Lock, Mic2 } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { getLessons, getModules } from "@/api/endpoints";
import type { LessonWithSummary } from "@/api/types";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressRing,
  RoundIconButton,
  Screen,
  ScreenState,
  SectionHeader,
  StatTile,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { describeError } from "@/hooks/useServerStatus";
import {
  isCleared,
  isLessonUnlocked,
  lockReason,
  moduleCompletion,
  nextLesson,
} from "@/practice/progression";
import { normalizeScore } from "@/practice/scoring";
import { colors, spacing } from "@/theme/theme";

export default function ModuleLessonsScreen() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const numericModuleId = Number(moduleId);

  const modulesQuery = useQuery({ queryKey: ["modules"], queryFn: getModules });
  const lessonsQuery = useQuery({
    queryKey: ["lessons", numericModuleId],
    queryFn: () => getLessons(numericModuleId),
    enabled: Number.isFinite(numericModuleId),
  });

  const module = modulesQuery.data?.find((item) => item.id === numericModuleId);
  const lessons = lessonsQuery.data ?? [];
  const upNext = nextLesson(lessons);
  const completion = moduleCompletion(lessons);

  return (
    <Screen refreshing={lessonsQuery.isFetching} onRefresh={() => lessonsQuery.refetch()}>
      <View style={styles.backRow}>
        <RoundIconButton accessibilityLabel="Back to all modules" onPress={() => router.back()}>
          <ArrowLeft color={colors.hunter} size={18} />
        </RoundIconButton>
        <Body weight="semibold" style={{ color: colors.hunter }}>
          All modules
        </Body>
      </View>

      <SectionHeader
        eyebrow={module ? `Module ${module.sort_order}` : "Module"}
        title={module?.title ?? "Lessons"}
        size={26}
        subtitle={module?.description ?? "Theory first, then practice, then the exam."}
      />

      {module ? (
        <Card variant="dark">
          <View style={styles.summaryRow}>
            <ProgressRing score={completion} size={88} strokeWidth={7} onDark label={`${completion}%`} />
            <View style={styles.summaryText}>
              <Eyebrow onDark>Lesson path</Eyebrow>
              <Title size={18} onDark>
                {upNext ? "Keep going" : "Module complete"}
              </Title>
              <Body size={12} onDark>
                {lessons.filter(isCleared).length} of {lessons.length} lessons cleared.
              </Body>
            </View>
          </View>
          <View style={styles.statsRow}>
            <StatTile
              tone="translucent"
              label="Theory"
              value={String(lessons.filter((l) => l.lesson_type === "theory").length)}
            />
            <StatTile
              tone="translucent"
              label="Practice"
              value={String(lessons.filter((l) => l.lesson_type === "practice").length)}
            />
            <StatTile
              tone="translucent"
              label="Exam"
              value={String(lessons.filter((l) => l.lesson_type === "exam").length)}
            />
          </View>
        </Card>
      ) : null}

      <ScreenState
        isLoading={lessonsQuery.isLoading}
        isError={lessonsQuery.isError}
        errorMessage={describeError(lessonsQuery.error, "Could not load the lessons.")}
        onRetry={() => lessonsQuery.refetch()}
        isEmpty={lessons.length === 0}
        loadingRows={3}
        empty={{
          title: "No lessons here yet",
          message:
            "This module has no published lessons. Pull down to check again, or head back and pick another module.",
          illustration: ILLUSTRATION_PROGRESS,
          actionLabel: "All modules",
          onAction: () => router.back(),
        }}>
        {lessons.map((lesson) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            lessons={lessons}
            moduleId={numericModuleId}
            isNext={upNext?.id === lesson.id}
          />
        ))}
      </ScreenState>
    </Screen>
  );
}

function LessonRow({
  lesson,
  lessons,
  moduleId,
  isNext,
}: {
  lesson: LessonWithSummary;
  lessons: LessonWithSummary[];
  moduleId: number;
  isNext: boolean;
}) {
  const unlocked = isLessonUnlocked(lessons, lesson.id);
  const locked = !unlocked;
  const cleared = isCleared(lesson);
  const summary = lesson.session_summary;

  const Icon =
    lesson.lesson_type === "theory"
      ? BookOpenText
      : lesson.lesson_type === "exam"
        ? GraduationCap
        : Mic2;

  const subtitle =
    lesson.lesson_type === "theory"
      ? "Theory"
      : lesson.lesson_type === "exam"
        ? "Exam · pass with 70 to unlock the next module"
        : `Practice · ${lesson.words.length} ${lesson.words.length === 1 ? "word" : "words"}`;

  const card = (
    <Card
      style={[
        styles.lessonCard,
        locked && styles.lockedCard,
        isNext && styles.nextCard,
      ]}>
      <View style={styles.lessonRow}>
        <View style={[styles.lessonIcon, locked && { backgroundColor: colors.platinum }]}>
          {locked ? (
            <Lock color={colors.slate} size={18} />
          ) : (
            <Icon color={colors.hunter} size={20} />
          )}
        </View>
        <View style={styles.lessonBody}>
          <Title size={16}>{lesson.title}</Title>
          <Body size={12}>{subtitle}</Body>
        </View>
        {cleared ? (
          <Chip label="Passed" status="correct" />
        ) : summary?.best_score != null ? (
          <Chip
            label={`Best ${normalizeScore(summary.best_score)}`}
            status={summary.best_score >= 50 ? "mixed" : "needs-work"}
          />
        ) : isNext ? (
          <Chip label="Next up" status="accent" />
        ) : null}
      </View>
      {locked ? (
        <Banner tone="info" message={lockReason(lessons, lesson.id) ?? "Locked for now."} />
      ) : null}
    </Card>
  );

  if (locked) return card;

  return (
    <Link
      href={{
        pathname: "/lesson/[lessonId]",
        params: { lessonId: lesson.id, moduleId: String(moduleId) },
      }}
      asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${lesson.title}`}>
        {card}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  summaryText: {
    flex: 1,
    gap: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  lessonCard: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  nextCard: {
    borderWidth: 2,
    borderColor: colors.yellowGreen,
  },
  lockedCard: {
    backgroundColor: "rgba(233,236,239,0.7)",
  },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  lessonIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonBody: {
    flex: 1,
    gap: 2,
  },
});
