// One exercise of any kind from the content model (docs/PLATFORM.md, section
// 3.1). Each kind keeps its own draft and reports a complete answer upwards,
// or null while it is incomplete; the session grades it on the device with
// gradeExercise. After grading, `result` locks the view and shows what was
// right.
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Volume2 } from "lucide-react-native";

import { ChoiceButton, type ChoiceState } from "@/components/games/ChoiceButton";
import { SpeakerButton } from "@/components/games/SpeakerButton";
import { Body, Chip, InfoPanel, TextField, Title } from "@/components/ui";
import { seededRng, shuffle } from "@/games/random";
import type { PracticeVoice } from "@/hooks/usePracticeVoice";
import { GAP, type Exercise, type ExerciseAnswer, type GradeResult } from "@/platform/content-model";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

export interface ExerciseViewProps {
  exercise: Exercise;
  packId: string;
  result: GradeResult | null;
  onChange: (answer: ExerciseAnswer | null) => void;
  voice: PracticeVoice;
}

function seedFor(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function ExerciseView(props: ExerciseViewProps) {
  const { exercise } = props;
  return (
    <View style={styles.wrap}>
      <Body size={type.footnote} tone="muted" weight="semibold">
        {exercise.prompt}
      </Body>
      {(() => {
        switch (exercise.kind) {
          case "multiple_choice":
            return <MultipleChoice {...props} exercise={exercise} />;
          case "matching":
            return <Matching {...props} exercise={exercise} />;
          case "gap_fill":
            return <GapFill {...props} exercise={exercise} />;
          case "sentence_building":
            return <SentenceBuilding {...props} exercise={exercise} />;
          case "error_correction":
            return <TypedAnswer {...props} kind="error_correction" lead={exercise.sentence} initial={exercise.sentence} />;
          case "transformation":
            return <TypedAnswer {...props} kind="transformation" lead={exercise.source} hint={exercise.instruction} initial="" />;
          case "dictation":
            return <Dictation {...props} exercise={exercise} />;
          case "minimal_pair":
            return <MinimalPair {...props} exercise={exercise} />;
          case "flashcard":
            return <Flashcard {...props} exercise={exercise} />;
        }
      })()}
    </View>
  );
}

type Of<K extends Exercise["kind"]> = Extract<Exercise, { kind: K }>;

function MultipleChoice({ exercise, result, onChange }: ExerciseViewProps & { exercise: Of<"multiple_choice"> }) {
  const [choice, setChoice] = useState<number | null>(null);
  return (
    <View style={styles.wrap}>
      {exercise.passage ? (
        <InfoPanel>
          <Body size={type.callout}>{exercise.passage}</Body>
        </InfoPanel>
      ) : null}
      <Title size={type.title3}>{exercise.question}</Title>
      <View style={styles.list}>
        {exercise.options.map((option, index) => {
          const state: ChoiceState = result
            ? index === exercise.answer
              ? "correct"
              : index === choice
                ? "wrong"
                : "dimmed"
            : index === choice
              ? "selected"
              : "idle";
          return (
            <ChoiceButton
              key={option}
              testID={`choice-${index}`}
              badge={LETTERS[index]}
              label={option}
              state={state}
              disabled={result !== null}
              onPress={() => {
                setChoice(index);
                onChange({ kind: "multiple_choice", choice: index });
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function Matching({ exercise, result, onChange }: ExerciseViewProps & { exercise: Of<"matching"> }) {
  const order = useMemo(() => shuffle(exercise.pairs.map((_, i) => i), seededRng(seedFor(exercise.id))), [exercise]);
  const [mapping, setMapping] = useState<(number | null)[]>(() => exercise.pairs.map(() => null));
  const [left, setLeft] = useState<number | null>(null);

  function pickRight(right: number) {
    if (left === null || result) return;
    const next = mapping.map((value) => (value === right ? null : value));
    next[left] = right;
    setMapping(next);
    setLeft(next.findIndex((value) => value === null) === -1 ? null : next.findIndex((value) => value === null));
    onChange(next.every((value) => value !== null) ? { kind: "matching", mapping: next as number[] } : null);
  }

  return (
    <View style={styles.matching}>
      <View style={styles.column}>
        {exercise.pairs.map((pair, i) => {
          const matched = mapping[i];
          const ok = result?.parts?.[i];
          return (
            <MatchTile
              key={`l-${pair.left}`}
              testID={`match-left-${i}`}
              label={pair.left}
              sub={matched !== null ? exercise.pairs[matched].right : undefined}
              selected={left === i}
              tone={result ? (ok ? "correct" : "wrong") : matched !== null ? "paired" : "idle"}
              onPress={() => !result && setLeft(i)}
              hint="Then choose its match on the right."
            />
          );
        })}
      </View>
      <View style={styles.column}>
        {order.map((right, position) => {
          const used = mapping.includes(right);
          return (
            <MatchTile
              key={`r-${exercise.pairs[right].right}`}
              testID={`match-right-${position}`}
              label={exercise.pairs[right].right}
              selected={false}
              tone={used ? "used" : "idle"}
              onPress={() => pickRight(right)}
              hint={left === null ? "Choose an item on the left first." : `Matches ${exercise.pairs[left].left}.`}
            />
          );
        })}
      </View>
      {result && !result.correct ? (
        <InfoPanel style={styles.fullWidth}>
          {exercise.pairs.map((pair) => (
            <Body key={pair.left} size={type.footnote}>{`${pair.left} → ${pair.right}`}</Body>
          ))}
        </InfoPanel>
      ) : null}
    </View>
  );
}

function MatchTile({
  label,
  sub,
  selected,
  tone,
  onPress,
  hint,
  testID,
}: {
  testID: string;
  label: string;
  sub?: string;
  selected: boolean;
  tone: "idle" | "paired" | "used" | "correct" | "wrong";
  onPress: () => void;
  hint: string;
}) {
  const bg =
    tone === "correct" ? colors.yellowGreen : tone === "wrong" ? colors.brickSoft : tone === "paired" ? colors.limeSoft : tone === "used" ? colors.platinum : colors.white;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, matched with ${sub}` : label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: bg }, selected && styles.tileSelected, pressed && styles.pressed]}>
      <Text maxFontSizeMultiplier={maxScale.control} style={styles.tileText}>
        {label}
      </Text>
      {sub ? (
        <Text maxFontSizeMultiplier={maxScale.control} style={styles.tileSub}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

function GapFill({ exercise, result, onChange }: ExerciseViewProps & { exercise: Of<"gap_fill"> }) {
  const parts = exercise.text.split(GAP);
  const gapCount = parts.length - 1;
  const [gaps, setGaps] = useState<string[]>(() => Array.from({ length: gapCount }, () => ""));
  const bank = useMemo(() => (exercise.bank ? shuffle(exercise.bank, seededRng(seedFor(exercise.id))) : null), [exercise]);

  function update(next: string[]) {
    setGaps(next);
    onChange(next.every((g) => g.trim()) ? { kind: "gap_fill", gaps: next } : null);
  }

  const spoken = parts.map((part, i) => (i < gapCount ? `${part}${gaps[i] || "blank"}` : part)).join("");

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" accessibilityLabel={spoken} maxFontSizeMultiplier={maxScale.title} style={styles.sentence}>
        {parts.map((part, i) => (
          <Text key={i}>
            {part}
            {i < gapCount ? <Text style={gaps[i] ? styles.filled : styles.blank}>{gaps[i] || "_____"}</Text> : null}
          </Text>
        ))}
      </Text>
      {bank ? (
        <View style={styles.wrap}>
          <View style={styles.chips}>
            {bank.map((word, i) => (
              <Chip
                key={`${word}-${i}`}
                testID={`bank-${i}`}
                label={word}
                onPress={
                  result
                    ? undefined
                    : () => {
                        const at = gaps.findIndex((g) => !g);
                        if (at === -1) return;
                        const next = [...gaps];
                        next[at] = word;
                        update(next);
                      }
                }
              />
            ))}
          </View>
          {!result && gaps.some(Boolean) ? (
            <Chip label="Clear" status="neutral" onPress={() => update(gaps.map(() => ""))} accessibilityHint="Empties every gap." />
          ) : null}
        </View>
      ) : (
        gaps.map((value, i) => (
          <TextField
            key={i}
            testID={`gap-${i}`}
            label={gapCount > 1 ? `Gap ${i + 1}` : "Your answer"}
            value={value}
            editable={!result}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(text) => {
              const next = [...gaps];
              next[i] = text;
              update(next);
            }}
          />
        ))
      )}
      {result && !result.correct ? <Expected lines={[parts.map((part, i) => (i < gapCount ? `${part}${exercise.answers[i][0]}` : part)).join("")]} /> : null}
    </View>
  );
}

function SentenceBuilding({ exercise, result, onChange }: ExerciseViewProps & { exercise: Of<"sentence_building"> }) {
  const tokens = useMemo(
    () => shuffle([...exercise.answer, ...(exercise.distractors ?? [])].map((text, id) => ({ id, text })), seededRng(seedFor(exercise.id))),
    [exercise],
  );
  const [built, setBuilt] = useState<number[]>([]);

  function update(next: number[]) {
    setBuilt(next);
    onChange(next.length > 0 ? { kind: "sentence_building", tokens: next.map((id) => tokens.find((t) => t.id === id)!.text) } : null);
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.builder, result && (result.correct ? styles.builderRight : styles.builderWrong)]} accessibilityLabel={`Your sentence: ${built.map((id) => tokens.find((t) => t.id === id)?.text).join(" ") || "empty"}`}>
        {built.length === 0 ? (
          <Body size={type.callout} tone="muted">
            Tap the words in order.
          </Body>
        ) : (
          built.map((id, index) => (
            <Chip key={id} label={tokens.find((t) => t.id === id)!.text} status="accent" onPress={result ? undefined : () => update(built.filter((_, i) => i !== index))} accessibilityHint="Removes this word." />
          ))
        )}
      </View>
      <View style={styles.chips}>
        {tokens
          .filter((token) => !built.includes(token.id))
          .map((token, position) => (
            <Chip key={token.id} testID={`token-${position}`} label={token.text} onPress={result ? undefined : () => update([...built, token.id])} accessibilityHint="Adds this word." />
          ))}
      </View>
      {result && !result.correct ? <Expected lines={[exercise.answer.join(" ")]} /> : null}
    </View>
  );
}

function TypedAnswer({
  exercise,
  result,
  onChange,
  kind,
  lead,
  hint,
  initial,
}: ExerciseViewProps & { kind: "error_correction" | "transformation"; lead: string; hint?: string; initial: string }) {
  const [text, setText] = useState(initial);
  const answers = (exercise as Of<"error_correction"> | Of<"transformation">).answers;
  return (
    <View style={styles.wrap}>
      <Title size={type.title3}>{lead}</Title>
      {hint ? <Body size={type.callout} weight="semibold">{hint}</Body> : null}
      <TextField
        testID="typed-answer"
        label={kind === "error_correction" ? "Corrected sentence" : "Your sentence"}
        value={text}
        editable={!result}
        multiline
        autoCorrect={false}
        onChangeText={(value) => {
          setText(value);
          onChange(value.trim() ? { kind, text: value } : null);
        }}
      />
      {result && !result.correct ? <Expected lines={answers.slice(0, 2)} /> : null}
    </View>
  );
}

function Dictation({ exercise, result, onChange, voice, packId }: ExerciseViewProps & { exercise: Of<"dictation"> }) {
  const [text, setText] = useState("");
  return (
    <View style={styles.wrap}>
      <SpeakerButton label="Play the sentence" playing={voice.speaking === exercise.text} onPress={() => voice.speak(exercise.text, { packId, path: exercise.audio })} />
      <TextField
        testID="typed-answer"
        label="What you heard"
        value={text}
        editable={!result}
        multiline
        autoCorrect={false}
        onChangeText={(value) => {
          setText(value);
          onChange(value.trim() ? { kind: "dictation", text: value } : null);
        }}
      />
      {result ? <Expected lines={[exercise.text]} title={result.correct ? "Exactly" : "It said"} /> : null}
    </View>
  );
}

function MinimalPair({ exercise, result, onChange, voice, packId }: ExerciseViewProps & { exercise: Of<"minimal_pair"> }) {
  // Which word plays is chosen once per showing, so the learner cannot learn the order.
  const [played] = useState<0 | 1>(() => (Math.random() < 0.5 ? 0 : 1));
  const [choice, setChoice] = useState<0 | 1 | null>(null);
  const word = exercise.words[played];
  return (
    <View style={styles.wrap}>
      <SpeakerButton label="Play the word" playing={voice.speaking === word} onPress={() => voice.speak(word, { packId, path: exercise.audio[played] })} />
      <View style={styles.list}>
        {exercise.words.map((option, index) => {
          const i = index as 0 | 1;
          const state: ChoiceState = result ? (i === played ? "correct" : i === choice ? "wrong" : "dimmed") : choice === i ? "selected" : "idle";
          return (
            <ChoiceButton
              key={option}
              testID={`choice-${index}`}
              label={option}
              state={state}
              disabled={result !== null}
              onPress={() => {
                setChoice(i);
                onChange({ kind: "minimal_pair", played, choice: i });
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function Flashcard({ exercise, result, onChange, voice, packId }: ExerciseViewProps & { exercise: Of<"flashcard"> }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={styles.cardFront}>
        <Title size={type.title1}>{exercise.front}</Title>
        <Pressable accessibilityRole="button" accessibilityLabel={`Hear ${exercise.front}`} onPress={() => voice.speak(exercise.front, exercise.audio ? { packId, path: exercise.audio } : undefined)} style={styles.hear}>
          <Volume2 color={colors.hunter} size={20} />
        </Pressable>
      </View>
      {shown || result ? (
        <InfoPanel>
          <Body size={type.body} weight="semibold">
            {exercise.back}
          </Body>
          {exercise.example ? <Body size={type.footnote} tone="muted">{exercise.example.text}</Body> : null}
        </InfoPanel>
      ) : (
        <ChoiceButton label="Show the answer" onPress={() => setShown(true)} />
      )}
      {shown && !result ? (
        <View style={styles.grades}>
          {(["again", "good", "easy"] as const).map((grade) => (
            <Chip key={grade} label={grade === "again" ? "Forgot" : grade === "good" ? "Got it" : "Easy"} onPress={() => onChange({ kind: "flashcard", grade })} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Expected({ lines, title = "Answer" }: { lines: string[]; title?: string }) {
  return (
    <InfoPanel>
      <Body size={type.caption} tone="muted" weight="semibold">
        {title}
      </Body>
      {lines.map((line) => (
        <Body key={line} size={type.callout} weight="semibold">
          {line}
        </Body>
      ))}
    </InfoPanel>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { gap: spacing.md },
    sentence: { fontFamily: fonts.kicker, fontSize: type.title3, lineHeight: Math.round(type.title3 * 1.35), color: colors.hunter },
    filled: { color: colors.sageText, textDecorationLine: "underline" },
    blank: { color: colors.slate },
    list: { gap: spacing.sm },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    matching: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    column: { flex: 1, minWidth: 140, gap: spacing.sm },
    fullWidth: { width: "100%" },
    tile: {
      minHeight: TAP_TARGET + 8,
      borderRadius: radii.control,
      padding: spacing.md,
      justifyContent: "center",
      backgroundColor: colors.platinum,
    },
    tileSelected: { backgroundColor: colors.limeSoft },
    pressed: { opacity: 0.8 },
    tileText: { fontFamily: fonts.bodySemiBold, fontSize: type.callout, color: colors.carbon },
    tileSub: { fontFamily: fonts.body, fontSize: type.caption, color: colors.iron, marginTop: spacing.xxs },
    builder: {
      minHeight: 64,
      borderRadius: radii.panel,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.paleSlate,
      padding: spacing.md,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      alignItems: "center",
    },
    builderRight: { borderColor: colors.yellowGreen, borderStyle: "solid" },
    builderWrong: { borderColor: colors.brick, borderStyle: "solid" },
    cardFront: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    hear: { width: TAP_TARGET, height: TAP_TARGET, borderRadius: radii.pill, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
    grades: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  }),
);
