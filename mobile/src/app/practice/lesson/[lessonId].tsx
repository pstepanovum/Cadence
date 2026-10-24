// A grammar lesson: its exercises in order, graded on the phone, counted as
// completed the first time it is finished.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SessionRunner } from "@/components/exercises/SessionRunner";
import { Body, Button, Card, Chip, EmptyState, Eyebrow, LoadingBlock, Screen, Title, TopBar } from "@/components/ui";
import { findGrammarPoint, findLesson, lessonExercises, packIdForLevel } from "@/content/catalog";
import { spacing, type } from "@/theme/theme";
import { parseLevelParam, useLevelPack } from "@/content/useContent";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";

export default function GrammarLessonScreen() {
  const params = useLocalSearchParams<{ lessonId: string; level?: string }>();
  const level = parseLevelParam(params.level);
  const pack = useLevelPack(level);
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(false);

  if (pack.isLoading) {
    return (
      <Screen>
        <TopBar onClose={() => router.back()} eyebrow={level} title="Lesson" />
        <LoadingBlock rows={2} label="Opening the lesson…" />
      </Screen>
    );
  }

  const lesson = pack.content ? findLesson(pack.content, params.lessonId) : undefined;
  if (!pack.content || !lesson) {
    return (
      <Screen>
        <TopBar onClose={() => router.back()} eyebrow={level} title="Lesson" />
        <EmptyState title="Lesson not found" message="It may be in a pack that isn't on this phone." illustration={ILLUSTRATION_PROGRESS} actionLabel="Back to Learn" onAction={() => router.back()} />
      </Screen>
    );
  }

  if (!started) {
    const points = lesson.grammarPointIds.map((id) => findGrammarPoint(pack.content!, id)).filter((p) => p !== undefined);
    return (
      <Screen>
        <TopBar onClose={() => router.back()} eyebrow={`${level} lesson · ${lesson.minutes} min`} title={lesson.title} />
        <Body size={type.callout}>{lesson.goal}</Body>
        {points.map((point) => (
          <Card key={point.id}>
            <Eyebrow>Grammar</Eyebrow>
            {/* A one-point lesson often reuses the point's title and summary; say it once. */}
            {point.title.trim() !== lesson.title.trim() ? <Title size={type.headline}>{point.title}</Title> : null}
            {point.summary.trim() !== lesson.goal.trim() ? <Body size={type.callout}>{point.summary}</Body> : null}
            <View style={styles.patterns}>
              {point.patterns.map((pattern) => (
                <Chip key={pattern} label={pattern} />
              ))}
            </View>
            <Button label="Read the full explanation" variant="tonal" onPress={() => router.push({ pathname: "/grammar/[pointId]", params: { pointId: point.id, level } })} />
          </Card>
        ))}
        <Button label="Start the lesson" onPress={() => setStarted(true)} />
      </Screen>
    );
  }

  return (
    <SessionRunner
      key={round}
      eyebrow={`${level} lesson`}
      title={lesson.title}
      exercises={lessonExercises(pack.content, lesson.id)}
      packId={packIdForLevel(level)}
      level={level}
      kind="lesson"
      refId={lesson.id}
      lessonId={lesson.id}
      onClose={() => router.back()}
      onAgain={() => setRound((n) => n + 1)}
    />
  );
}

const styles = StyleSheet.create({
  patterns: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
