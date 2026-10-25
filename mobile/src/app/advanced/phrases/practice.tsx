// Today's phrase session: what your assistant assigned, reviews due and a
// few new phrases, each through hear and repeat, gap fill, rephrase and
// shadowing, recording at the spoken steps; the rating schedules its review.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Button, Card, EmptyState, Eyebrow, LoadingBlock, Screen, TextField, Title, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { getAdvanced, gradeItem, useAdvancedState } from "@/learning/advanced-store";
import { Highlighted, RateRow, StepLine, Tag } from "@/learning/advanced-ui";
import { today } from "@/learning/store";
import { drillsForPhrase, gradeFromSelf, gradeGapFill, gradeRephrase, PHRASE_DRILL_TITLES, type Phrase, type PhraseDrill } from "@/platform/phrase-bank";
import { buildPracticeDay } from "@/platform/practice-day";
import type { Grade } from "@/platform/srs";
import { RecordCompare } from "@/recordings/RecordCompare";
import { spacing, type, themed } from "@/theme/theme";

export default function PhrasePracticeScreen() {
  const content = useAdvancedContent();
  const { loaded } = useAdvancedState();
  const queue = useMemo(() => {
    if (!content || !loaded) return null;
    const s = getAdvanced();
    const day = buildPracticeDay({ day: today(), phrases: content.phrases, slang: [], cards: s.cards, list: s.list.filter((i) => i.itemId.startsWith("phrase.")), track: null, catalog: [], limits: { fresh: 5, due: 12, assigned: 8 } });
    return day.items.map((i) => ({ phrase: content.phrases.find((p) => p.id === i.itemId), reason: i.reason })).filter((x): x is { phrase: Phrase; reason: typeof x.reason } => Boolean(x.phrase));
    // The queue is fixed for the session so grading never reshuffles it.
  }, [content, loaded]);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [missed, setMissed] = useState(false);
  const [graded, setGraded] = useState<Grade[]>([]);

  if (!content || !queue) {
    return (
      <Screen>
        <TopBar title="Today's phrases" onClose={() => router.back()} />
        <LoadingBlock rows={3} label="Building today's session…" />
      </Screen>
    );
  }
  if (queue.length === 0 || index >= queue.length) {
    const again = graded.filter((g) => g === "again").length;
    return (
      <Screen>
        <TopBar title="Today's phrases" onClose={() => router.back()} />
        <EmptyState
          title={queue.length === 0 ? "Nothing to practise right now" : `${graded.length} phrase${graded.length === 1 ? "" : "s"} practised`}
          message={queue.length === 0 ? "Everything you started is scheduled for later. Browse the bank to add new ones." : again ? `${again} come back tomorrow; the rest are scheduled further out.` : "All scheduled further out. Listen to your takes in Recordings."}
          actionLabel="Done"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const { phrase, reason } = queue[index];
  const drills = drillsForPhrase(phrase);
  const drill = drills[step];
  const finish = (grade: Grade) => {
    const final: Grade = missed && grade !== "again" ? "hard" : grade;
    gradeItem(phrase.id, final);
    setGraded((g) => [...g, final]);
    setIndex((i) => i + 1);
    setStep(0);
    setMissed(false);
  };

  return (
    <Screen>
      <TopBar eyebrow={`Phrase ${index + 1} of ${queue.length}`} onClose={() => router.back()} closeLabel="Stop for now" trailing={<Tag label={reason === "due" ? "Review" : reason === "assigned" ? "Assigned" : "New"} tone={reason === "due" ? "green" : "grey"} />} />
      <StepLine done={index * (drills.length + 1) + step} total={queue.length * (drills.length + 1)} />
      <View style={styles.head}>
        <Title size={type.title1}>{phrase.text}</Title>
        <Body tone="muted">{phrase.meaning}</Body>
      </View>
      {drill ? (
        <DrillCard key={`${phrase.id}-${step}`} phrase={phrase} drill={drill} pack={content.audio[phrase.id] ?? null} onNext={() => setStep((s) => s + 1)} onMiss={() => setMissed(true)} />
      ) : (
        <Card style={styles.card}>
          <Title size={type.headline}>How did it go?</Title>
          <Body size={type.footnote} tone="muted">
            Be strict: Clean only if you could say it without the model.
          </Body>
          <RateRow onRate={(r) => finish(gradeFromSelf(r))} />
        </Card>
      )}
    </Screen>
  );
}

function DrillCard({ phrase, drill, pack, onNext, onMiss }: { phrase: Phrase; drill: PhraseDrill; pack: { packId: string; path: string } | null; onNext: () => void; onMiss: () => void }) {
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const spoken = drill.kind === "listen_repeat" || drill.kind === "shadowing";
  return (
    <Card style={styles.card}>
      <View style={styles.gap}>
        <Eyebrow>{PHRASE_DRILL_TITLES[drill.kind]}</Eyebrow>
        <Body size={type.footnote} tone="muted">
          {drill.instruction}
        </Body>
      </View>
      {spoken ? (
        <>
          <Highlighted text={drill.say} form={phrase.form} />
          <RecordCompare itemId={phrase.id} target={{ text: drill.say, pack }} />
          <Button label="Next" onPress={onNext} />
        </>
      ) : (
        <>
          <Body size={type.headline}>{drill.kind === "gap_fill" ? drill.text : drill.plain}</Body>
          <Body size={type.footnote} tone="muted">
            {drill.hint}
          </Body>
          <TextField value={answer} onChangeText={setAnswer} placeholder={drill.kind === "gap_fill" ? "The missing phrase" : "Your version"} autoCapitalize={drill.kind === "gap_fill" ? "none" : "sentences"} autoCorrect={false} multiline={drill.kind === "rephrase"} />
          {checked !== null ? <Body tone={checked ? "strong" : "muted"}>{checked ? (drill.kind === "rephrase" ? `Right. Model: ${phrase.example}` : "Right.") : drill.kind === "gap_fill" ? `It's "${phrase.form}".` : `Model: ${phrase.example}`}</Body> : null}
          <Button
            label={checked === null ? "Check" : "Next"}
            onPress={() => {
              if (checked !== null) return onNext();
              const ok = drill.kind === "gap_fill" ? gradeGapFill(phrase, answer) : gradeRephrase(phrase, answer);
              setChecked(ok);
              if (!ok) onMiss();
            }}
          />
        </>
      )}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    head: { gap: spacing.xs },
    card: { gap: spacing.md },
    gap: { gap: spacing.xs },
  }),
);
