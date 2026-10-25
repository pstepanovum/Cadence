// Today's slang quiz: entries due for review and a few new ones, each asked
// one of three ways (what it means, where it fits, the natural reply). A miss
// comes back tomorrow; a right answer is rated after hearing the example.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Card, EmptyState, Eyebrow, LoadingBlock, Screen, Title, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { getAdvanced, gradeItem, useAdvancedState } from "@/learning/advanced-store";
import { QuizOptions, RateRow, StepLine } from "@/learning/advanced-ui";
import { today } from "@/learning/store";
import { buildSlangQuiz, dailyNewOrder, gradeFromSelf, SLANG_QUIZZES, type SlangEntry } from "@/platform/phrase-bank";
import { isDue, isNew } from "@/platform/srs";
import { RecordCompare } from "@/recordings/RecordCompare";
import { spacing, type, themed } from "@/theme/theme";

const KIND_TITLE = { meaning: "Meaning", context: "Fit the context", reply: "The natural reply" } as const;

export default function SlangQuizScreen() {
  const content = useAdvancedContent();
  const { loaded } = useAdvancedState();
  const queue = useMemo(() => {
    if (!content || !loaded) return null;
    const cards = getAdvanced().cards;
    const now = new Date();
    const due = content.slang.filter((e) => isDue(cards[e.id], now)).slice(0, 15);
    const fresh = dailyNewOrder(content.slang.filter((e) => isNew(cards[e.id]) && !e.dated).map((e) => e.id), today())
      .slice(0, Math.max(0, 10 - due.length))
      .map((id) => content.slang.find((e) => e.id === id))
      .filter((e): e is SlangEntry => Boolean(e));
    return [...due, ...fresh];
  }, [content, loaded]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);

  if (!content || !queue) {
    return (
      <Screen>
        <TopBar title="Slang quiz" onClose={() => router.back()} />
        <LoadingBlock rows={3} label="Building the quiz…" />
      </Screen>
    );
  }
  if (queue.length === 0 || index >= queue.length) {
    return (
      <Screen>
        <TopBar title="Slang quiz" onClose={() => router.back()} />
        <EmptyState title={queue.length ? `${right} of ${queue.length} right` : "Nothing to quiz right now"} message={queue.length ? "Misses come back tomorrow." : "Everything you have seen is scheduled for later."} actionLabel="Done" onAction={() => router.back()} />
      </Screen>
    );
  }
  const entry = queue[index];
  const quiz = buildSlangQuiz(entry, SLANG_QUIZZES[index % 3], content.slang, today());
  return (
    <Screen>
      <TopBar eyebrow={`${index + 1} of ${queue.length}`} onClose={() => router.back()} closeLabel="Stop for now" />
      <StepLine done={index} total={queue.length} />
      <Card style={styles.card}>
        <Eyebrow>{KIND_TITLE[quiz.kind]}</Eyebrow>
        <Title size={type.title3}>{quiz.question}</Title>
        <QuizOptions
          options={quiz.options}
          answer={quiz.answer}
          picked={picked}
          onPick={(i) => {
            setPicked(i);
            if (i === quiz.answer) setRight((r) => r + 1);
          }}
        />
        {picked !== null ? (
          <View style={styles.after}>
            <Body size={type.footnote} tone="muted">{`${entry.term}: ${entry.meaning} ${entry.usageNote}`}</Body>
            <RecordCompare itemId={entry.id} target={{ text: entry.examples[0], pack: content.audio[entry.id] ?? null }} compact />
            <RateRow
              onRate={(r) => {
                gradeItem(entry.id, picked === quiz.answer ? gradeFromSelf(r) : "again");
                setPicked(null);
                setIndex((i) => i + 1);
              }}
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { gap: spacing.md },
    after: { gap: spacing.md },
  }),
);
