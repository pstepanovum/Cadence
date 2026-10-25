// One slang entry: what it means, register, region, where it fits and where
// it doesn't, who says it and whether it sounds dated, examples to hear and
// record, and a question on it that feeds spaced review.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, EmptyState, Eyebrow, LoadingBlock, Screen, Title, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { gradeItem } from "@/learning/advanced-store";
import { QuizOptions, Tag } from "@/learning/advanced-ui";
import { today } from "@/learning/store";
import { buildSlangQuiz, gradeFromAnswer, SLANG_FIT_LABELS, SLANG_FITS, SLANG_QUIZZES } from "@/platform/phrase-bank";
import { RecordCompare } from "@/recordings/RecordCompare";
import { colors, fonts, radii, spacing, type, themed } from "@/theme/theme";

const REGION = { US: "American", UK: "British", global: "Everywhere" } as const;

export default function SlangEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const content = useAdvancedContent();
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const entry = content?.slang.find((e) => e.id === id);
  if (!content || !entry) {
    return (
      <Screen>
        <TopBar eyebrow="Slang" onBack={() => router.back()} />
        {!content ? <LoadingBlock rows={3} label="Opening…" /> : <EmptyState title="That entry isn't here" message="It may come with a newer content update." actionLabel="Back" onAction={() => router.back()} />}
      </Screen>
    );
  }
  const quiz = buildSlangQuiz(entry, SLANG_QUIZZES[round % 3], content.slang, today());
  return (
    <Screen>
      <TopBar eyebrow="Slang" onBack={() => router.back()} />
      <View style={styles.head}>
        <View style={styles.tags}>
          <Tag label={entry.partOfSpeech} />
          <Tag label={entry.register === "very-informal" ? "Very informal" : "Informal"} />
          <Tag label={REGION[entry.region]} />
          {entry.dated ? <Tag label="Sounds dated" tone="muted" /> : null}
        </View>
        <Title size={type.title1}>{entry.term}</Title>
        <Body tone="muted">{entry.meaning}</Body>
      </View>
      <Card style={styles.card}>
        <View style={styles.fits}>
          {SLANG_FITS.map((f) => {
            const on = entry.fits.includes(f);
            return (
              <View key={f} style={[styles.fit, on && (f === "avoid-at-work" ? styles.fitWarn : styles.fitOn)]} accessibilityLabel={`${SLANG_FIT_LABELS[f]}: ${on ? "yes" : "no"}`}>
                <Text style={[styles.fitLabel, on && styles.fitLabelOn, !on && styles.fitLabelOff]}>{SLANG_FIT_LABELS[f]}</Text>
              </View>
            );
          })}
        </View>
        <Body size={type.footnote} tone="muted">
          {entry.usageNote}
        </Body>
        {entry.dated && entry.datedNote ? (
          <Body size={type.footnote} tone="muted">{`Dated: ${entry.datedNote}`}</Body>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <Eyebrow>In use</Eyebrow>
        {entry.examples.map((example, i) => (
          <View key={example} style={styles.example}>
            <Body size={type.headline}>{example}</Body>
            <RecordCompare itemId={entry.id} target={{ text: example, pack: i === 0 ? (content.audio[entry.id] ?? null) : null }} compact={i > 0} />
          </View>
        ))}
      </Card>
      <Card style={styles.card}>
        <Title size={type.headline}>{quiz.question}</Title>
        <QuizOptions
          options={quiz.options}
          answer={quiz.answer}
          picked={picked}
          onPick={(i) => {
            setPicked(i);
            gradeItem(entry.id, gradeFromAnswer(i === quiz.answer));
          }}
        />
        {picked !== null ? (
          <Button
            label="Another question"
            variant="secondary"
            onPress={() => {
              setPicked(null);
              setRound((r) => r + 1);
            }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    head: { gap: spacing.sm },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    card: { gap: spacing.md },
    example: { gap: spacing.sm },
    fits: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    fit: { borderRadius: radii.tile, backgroundColor: colors.platinum, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
    fitOn: { backgroundColor: colors.hunter },
    fitWarn: { backgroundColor: colors.carbon },
    fitLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.footnote, color: colors.iron },
    fitLabelOn: { color: colors.snow },
    fitLabelOff: { color: colors.slate, textDecorationLine: "line-through" },
  }),
);
