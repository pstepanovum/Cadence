// One grammar point: the explanation, the patterns, examples (with their
// sources credited), common mistakes, and a practice set for just this point.
import { router, useLocalSearchParams } from "expo-router";
import { Volume2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, Chip, EmptyState, Eyebrow, InfoPanel, LoadingBlock, Screen, TopBar } from "@/components/ui";
import { emphasisRuns, findGrammarPoint } from "@/content/catalog";
import { parseLevelParam, useLevelPack } from "@/content/useContent";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

export default function GrammarPointScreen() {
  const params = useLocalSearchParams<{ pointId: string; level?: string }>();
  const level = parseLevelParam(params.level);
  const pack = useLevelPack(level);
  const voice = usePracticeVoice();

  if (pack.isLoading) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} eyebrow="Grammar" />
        <LoadingBlock rows={3} />
      </Screen>
    );
  }

  const point = pack.content ? findGrammarPoint(pack.content, params.pointId) : undefined;
  if (!point || !pack.content) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} eyebrow="Grammar" />
        <EmptyState title="Not found" message="This grammar point isn't in the packs on this phone." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const practiceable = pack.content.exercises.some((e) => e.grammarPointIds.includes(point.id) && e.kind !== "flashcard");

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow={`${point.level} grammar`} title={point.title} />
      <Body size={type.callout} weight="semibold">
        {point.summary}
      </Body>

      <Card>
        {point.explanation.split(/\n\n+/).map((paragraph, i) => (
          <Text key={i} maxFontSizeMultiplier={maxScale.body} style={styles.paragraph}>
            {emphasisRuns(paragraph).map((run, j) => (
              <Text key={j} style={run.emphasis ? styles.emphasis : undefined}>
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
        <View style={styles.patterns}>
          {point.patterns.map((pattern) => (
            <Chip key={pattern} label={pattern} />
          ))}
        </View>
      </Card>

      <View style={styles.section}>
        <Eyebrow>Examples</Eyebrow>
        {point.examples.map((example) => (
          <View key={example.text} style={styles.example}>
            <View style={styles.exampleText}>
              <Body size={type.body}>{example.text}</Body>
              {example.note ? <Body size={type.caption} tone="muted">{example.note}</Body> : null}
              {example.source.kind === "tatoeba" ? (
                <Body size={type.caption} tone="muted">{`Tatoeba #${example.source.sentenceId}${example.source.author ? ` by ${example.source.author}` : ""}, CC BY 2.0 FR`}</Body>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Hear: ${example.text}`} onPress={() => voice.speak(example.text, example.audio ? { packId: `core-${level.toLowerCase()}`, path: example.audio } : undefined)} style={styles.hear}>
              <Volume2 color={colors.hunter} size={18} />
            </Pressable>
          </View>
        ))}
      </View>

      {point.commonErrors.length > 0 ? (
        <View style={styles.section}>
          <Eyebrow>Common mistakes</Eyebrow>
          {point.commonErrors.map((error) => (
            <InfoPanel key={error.wrong}>
              <Body size={type.callout} tone="error" style={styles.strike} >{`✗ ${error.wrong}`}</Body>
              <Body size={type.callout} weight="semibold">{`✓ ${error.right}`}</Body>
              <Body size={type.footnote} tone="muted">{error.note}</Body>
            </InfoPanel>
          ))}
        </View>
      ) : null}

      {practiceable ? (
        <Button label="Practise this" onPress={() => router.push({ pathname: "/practice/[mode]", params: { mode: "quiz", level, gp: point.id } })} />
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    paragraph: { fontFamily: fonts.body, fontSize: type.body, lineHeight: Math.round(type.body * 1.5), color: colors.iron },
    emphasis: { fontFamily: fonts.bodyBold, color: colors.hunter },
    patterns: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    section: { gap: spacing.sm },
    example: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.snow, borderRadius: radii.panel, padding: spacing.md },
    exampleText: { flex: 1, gap: spacing.xxs },
    hear: { width: TAP_TARGET, height: TAP_TARGET, borderRadius: radii.pill, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
    strike: { textDecorationLine: "line-through" },
  }),
);
