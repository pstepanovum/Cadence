import { useQuery } from "@tanstack/react-query";
import { Link, router, useLocalSearchParams } from "expo-router";
import { BookOpenText, GraduationCap, Lock, Mic2 } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { getLessons, getModules } from "@/api/endpoints";
import type { LessonWithSummary } from "@/api/types";
import {
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressRing,
  Screen,
  ScreenState,
  Title,
  TopBar,
  pressedCard,
} from "@/components/ui";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { useRefresh } from "@/hooks/useRefresh";
import { describeError } from "@/hooks/useServerStatus";
import {
  isCleared,
  isLessonUnlocked,
  lockReason,
  moduleCompletion,
  nextLesson,
} from "@/practice/progression";
import { normalizeScore } from "@/practice/scoring";
import { colors, overlays, radii, spacing, type } from "@/theme/theme";

export default function ModuleLessonsScreen() {
  const { moduleId } = useLocalSearchParams<{ moduleId: string }>();
  const numericModuleId = Number(moduleId);

  const modulesQuery = useQuery({ queryKey: ["modules"], queryFn: getModules });
  const lessonsQuery = useQuery({
    queryKey: ["lessons", numericModuleId],
    queryFn: () => getLessons(numericModuleId),
    enabled: Number.isFinite(numericModuleId),
  });
  const { refreshing, onRefresh } = useRefresh(() => lessonsQuery.refetch());

  const module = modulesQuery.data?.find((item) => item.id === numericModuleId);
  const lessons = lessonsQuery.data ?? [];
  const upNext = nextLesson(lessons);
  const completion = moduleCompletion(lessons);
  const firstLocked = lessons.find((lesson) => !isLessonUnlocked(lessons, lesson.id));

  return (
    <Screen tab refreshing={refreshing} onRefresh={onRefresh}>
      <TopBar
        onBack={() => router.back()}
        backLabel="Back to modules"
        eyebrow={module ? `Module ${module.sort_order}` : "Module"}
        title={module?.title ?? "Lessons"}
      />

      {module?.description ? (
        <Body size={type.callout} tone="muted">
          {module.description}
        </Body>
      ) : null}

      {module && lessons.length > 0 ? (
        <Card variant="dark" style={styles.summary}>
          <ProgressRing score={completion} size={80} strokeWidth={7} onDark label={`${completion}%`} />
          <View style={styles.summaryText}>
            <Eyebrow onDark>Lesson path</Eyebrow>
            <Title size={type.headline} onDark>
              {!upNext ? "Module complete" : lessons.some(isCleared) ? "Keep going" : "Start here"}
            </Title>
            <Body size={type.footnote} onDark tone="muted">
              {lessons.filter(isCleared).length} of {lessons.length} lessons cleared
            </Body>
          </View>
        </Card>
      ) : null}

      <ScreenState
        isLoading={lessonsQuery.isLoading}
        isError={lessonsQuery.isError}
        errorMessage={describeError(lessonsQuery.error, "Could not load the lessons.")}
        onRetry={() => void lessonsQuery.refetch()}
        isEmpty={lessons.length === 0}
        loadingRows={3}
        empty={{
          title: "No lessons here yet",
          message: "This module has no lessons yet. Pull down to check again.",
          illustration: ILLUSTRATION_PROGRESS,
          actionLabel: "All modules",
          onAction: () => router.back(),
        }}>
        <View style={styles.list}>
          {lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              lessons={lessons}
              moduleId={numericModuleId}
              isNext={upNext?.id === lesson.id}
              showLockReason={firstLocked?.id === lesson.id}
            />
          ))}
        </View>
      </ScreenState>
    </Screen>
  );
}

function LessonRow({
  lesson,
  lessons,
  moduleId,
  isNext,
  showLockReason,
}: {
  lesson: LessonWithSummary;
  lessons: LessonWithSummary[];
  moduleId: number;
  isNext: boolean;
  showLockReason: boolean;
}) {
  const locked = !isLessonUnlocked(lessons, lesson.id);
  const cleared = isCleared(lesson);
  const summary = lesson.session_summary;

  const Icon =
    lesson.lesson_type === "theory" ? BookOpenText : lesson.lesson_type === "exam" ? GraduationCap : Mic2;

  const subtitle = locked
    ? showLockReason
      ? (lockReason(lessons, lesson.id) ?? "Locked for now.")
      : "Locked"
    : lesson.lesson_type === "theory"
      ? "Theory"
      : lesson.lesson_type === "exam"
        ? "Exam · pass with 70"
        : `Practice · ${lesson.words.length} ${lesson.words.length === 1 ? "word" : "words"}`;

  const card = (
    <Card style={[styles.lessonCard, locked && styles.lockedCard, isNext && styles.nextCard]}>
      <View style={[styles.lessonIcon, locked && styles.lessonIconLocked]}>
        {locked ? <Lock color={colors.slate} size={18} /> : <Icon color={colors.hunter} size={20} />}
      </View>
      <View style={styles.lessonBody}>
        <Title size={type.headline}>{lesson.title}</Title>
        <Body size={type.footnote} tone="muted">
          {subtitle}
        </Body>
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
    </Card>
  );

  if (locked) {
    return (
      <View accessible accessibilityLabel={`${lesson.title}. ${subtitle}`}>
        {card}
      </View>
    );
  }

  return (
    <Link
      href={{
        pathname: "/lesson/[lessonId]",
        params: { lessonId: lesson.id, moduleId: String(moduleId) },
      }}
      asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${lesson.title}`}
        style={({ pressed }) => pressedCard(pressed)}>
        {card}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  summaryText: {
    flex: 1,
    gap: spacing.xxs,
  },
  list: {
    gap: spacing.md,
  },
  lessonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  nextCard: {
    borderWidth: 2,
    borderColor: colors.yellowGreen,
  },
  lockedCard: {
    backgroundColor: overlays.locked,
    boxShadow: undefined,
  },
  lessonIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonIconLocked: {
    backgroundColor: colors.platinum,
  },
  lessonBody: {
    flex: 1,
    gap: spacing.xxs,
  },
});
