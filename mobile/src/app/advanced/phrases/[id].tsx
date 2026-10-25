// One phrase: meaning, a natural example to hear, record and compare (A/B),
// the usage note, a gap fill and a rephrase, and a rating that sets when it
// comes back.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Button, Card, EmptyState, Eyebrow, LoadingBlock, Screen, TextField, Title, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { gradeItem, toggleListed, useAdvancedState } from "@/learning/advanced-store";
import { Highlighted, RateRow, Tag } from "@/learning/advanced-ui";
import { buildPhraseDrill, gradeFromAnswer, gradeFromSelf, gradeGapFill, gradeRephrase, PHRASE_SITUATIONS, type Phrase } from "@/platform/phrase-bank";
import { mastery } from "@/platform/srs";
import { RecordCompare } from "@/recordings/RecordCompare";
import { colors, spacing, type, themed } from "@/theme/theme";

const SITUATION = Object.fromEntries(PHRASE_SITUATIONS.map((s) => [s.id, s.title]));
const KIND = { chunk: "Chunk", collocation: "Collocation", frame: "Sentence frame" } as const;

export default function PhraseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const content = useAdvancedContent();
  const phrase = content?.phrases.find((p) => p.id === id);
  return (
    <Screen>
      <TopBar eyebrow="Phrase" onBack={() => router.back()} />
      {!content ? <LoadingBlock rows={3} label="Opening the phrase…" /> : !phrase ? <EmptyState title="That phrase isn't here" message="It may come with a newer content update." actionLabel="Back to the phrase bank" onAction={() => router.back()} /> : <PhraseBody phrase={phrase} pack={content.audio[phrase.id] ?? null} />}
    </Screen>
  );
}

function PhraseBody({ phrase, pack }: { phrase: Phrase; pack: { packId: string; path: string } | null }) {
  const { state } = useAdvancedState();
  const listed = state.list.some((i) => i.itemId === phrase.id);
  const stage = mastery(state.cards[phrase.id]);
  return (
    <>
      <View style={styles.head}>
        <View style={styles.tags}>
          <Tag label={phrase.level} />
          <Tag label={KIND[phrase.kind]} />
          {phrase.situations.map((s) => (
            <Tag key={s} label={SITUATION[s] ?? s} tone="muted" />
          ))}
        </View>
        <Title size={type.title1}>{phrase.text}</Title>
        <Body tone="muted">{phrase.meaning}</Body>
      </View>
      <Card style={styles.card}>
        <Eyebrow>Say it like this</Eyebrow>
        <Highlighted text={phrase.example} form={phrase.form} />
        <RecordCompare itemId={phrase.id} target={{ text: phrase.example, pack }} />
        {phrase.note ? (
          <Body size={type.footnote} tone="muted">
            {phrase.note}
          </Body>
        ) : null}
        <Button label={listed ? "On your practice list" : "Add to practice list"} variant="secondary" onPress={() => toggleListed(phrase.id)} />
      </Card>
      <GapFill phrase={phrase} />
      <Rephrase phrase={phrase} />
      <Card style={styles.card}>
        <Title size={type.headline}>How well do you own it?</Title>
        <Body size={type.footnote} tone="muted">
          {stage === "new" ? "Not reviewed yet." : `Review: ${stage}.`} Your rating sets when it comes back.
        </Body>
        <RateRow onRate={(r) => gradeItem(phrase.id, gradeFromSelf(r))} />
      </Card>
    </>
  );
}

function GapFill({ phrase }: { phrase: Phrase }) {
  const drill = buildPhraseDrill(phrase, "gap_fill");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const [tries, setTries] = useState(0);
  if (drill.kind !== "gap_fill") return null;
  return (
    <Card style={styles.card}>
      <Title size={type.headline}>Gap fill</Title>
      <Body>{drill.text}</Body>
      <Body size={type.footnote} tone="muted">
        {drill.hint}
      </Body>
      <TextField value={answer} onChangeText={setAnswer} placeholder="The missing phrase" autoCapitalize="none" autoCorrect={false} returnKeyType="done" />
      {result === true ? <Body weight="semibold" style={styles.right}>{`Right: ${phrase.form}.`}</Body> : result === false ? <Body tone="muted">{tries >= 2 ? `It's "${phrase.form}".` : "Not quite. Try again."}</Body> : null}
      <Button
        label="Check"
        onPress={() => {
          const ok = gradeGapFill(phrase, answer);
          setResult(ok);
          setTries((t) => t + 1);
          if (ok) gradeItem(phrase.id, gradeFromAnswer(true, tries + 1));
        }}
      />
    </Card>
  );
}

function Rephrase({ phrase }: { phrase: Phrase }) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  return (
    <Card style={styles.card}>
      <Title size={type.headline}>Rephrase</Title>
      <Body size={type.footnote} tone="muted">{`Say it again using "${phrase.text}", out loud first, then type it.`}</Body>
      <Body>{phrase.plain}</Body>
      <TextField value={answer} onChangeText={setAnswer} placeholder="Your version" multiline />
      {result !== null ? <Body tone={result ? "strong" : "muted"}>{result ? `That uses it. Compare: ${phrase.example}` : `Not there yet. One way: ${phrase.example}`}</Body> : null}
      <Button label="Check" onPress={() => setResult(gradeRephrase(phrase, answer))} />
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    head: { gap: spacing.sm },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    card: { gap: spacing.md },
    right: { color: colors.hunter },
  }),
);
