import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { PronunciationAssessment } from "@/api/types";
import {
  Banner,
  Body,
  Chip,
  Collapsible,
  Eyebrow,
  InfoPanel,
  ProgressRing,
  Title,
} from "@/components/ui";
import { useSpeech } from "@/hooks/useSpeech";
import { normalizeScore, phonemeCaption, scoreLabel, scoreStatus } from "@/practice/scoring";
import { soundIdForSymbol } from "@/practice/sounds";
import { colors, fonts, overlays, radii, spacing, type, themed } from "@/theme/theme";

/** The bare word a highlight chip stands for, without punctuation. */
function spokenWord(text: string): string {
  return text.replace(/[^\p{L}\p{N}'-]/gu, "").trim();
}

/**
 * The shared result panel, used by quick practice, lessons, exams, scenarios
 * and the coach — mirroring the web app's `AssessmentResult`.
 *
 * Tapping a word chip plays the reference pronunciation of that word alone,
 * which is the whole point of the word-by-word breakdown: seeing that "th" was
 * wrong is only useful next to hearing what it should be.
 */
export function AssessmentView({
  assessment,
  compact = false,
}: {
  assessment: PronunciationAssessment;
  /** Drops the ring and the summary panels — used inside a coach thread. */
  compact?: boolean;
}) {
  const score = normalizeScore(assessment.overallScore);
  const speech = useSpeech();

  const clean = assessment.highlights.filter((item) => item.status === "correct").length;
  const close = assessment.highlights.filter((item) => item.status === "mixed").length;
  const total = assessment.highlights.length;

  // The sounds this take missed, once each, linked to their mouth map.
  const weakSounds = [
    ...new Map(
      assessment.phonemes
        .filter((p) => p.status === "needs-work")
        .map((p) => [soundIdForSymbol(p.symbol), p.symbol] as const)
        .filter((entry): entry is readonly [string, string] => entry[0] !== null),
    ),
  ].slice(0, 4);

  function openSound(soundId: string) {
    router.push({ pathname: "/sounds/[soundId]", params: { soundId } });
  }

  function hearWord(word: string) {
    const target = spokenWord(word);
    if (target) speech.toggle(target);
  }

  return (
    <View style={styles.container}>
      {compact ? (
        <View style={styles.scoreRow}>
          <Chip label={`Score ${score}/100`} status={scoreStatus(score)} />
          <Body size={type.footnote} weight="medium" style={styles.flexText}>
            {scoreLabel(score)}
          </Body>
        </View>
      ) : (
        <View style={styles.scoreHeader}>
          <ProgressRing score={score} size={92} strokeWidth={7} />
          <View style={styles.scoreHeaderText}>
            <Eyebrow>Assessment score</Eyebrow>
            <Title size={type.title2}>{score}/100</Title>
            <Body size={type.footnote}>{assessment.summary || scoreLabel(score)}</Body>
          </View>
        </View>
      )}

      {!compact ? (
        <View style={styles.panelRow}>
          <InfoPanel style={styles.panel}>
            <Eyebrow>Target</Eyebrow>
            <Body weight="semibold" size={type.callout}>
              {assessment.targetText}
            </Body>
            {assessment.ipaTarget ? (
              <Body size={type.footnote} style={styles.ipa}>
                {assessment.ipaTarget}
              </Body>
            ) : null}
          </InfoPanel>
          <InfoPanel style={styles.panel}>
            <Eyebrow>Decoded phonemes</Eyebrow>
            <Body size={type.footnote} style={styles.ipa}>
              {assessment.transcript || "Nothing was decoded from this take."}
            </Body>
          </InfoPanel>
        </View>
      ) : null}

      {total > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Eyebrow>Word feedback</Eyebrow>
            <Chip label={`${clean}/${total} strong`} status="neutral" />
          </View>
          {speech.error ? <Banner message={speech.error} tone="error" /> : null}
          <View style={styles.chipsWrap}>
            {assessment.highlights.map((highlight, index) => (
              <Chip
                key={`${highlight.text}-${index}`}
                label={highlight.text}
                status={highlight.status}
                active={speech.activeText === spokenWord(highlight.text)}
                accessibilityHint={
                  highlight.feedback
                    ? `${highlight.feedback}. Tap to hear this word.`
                    : "Tap to hear this word."
                }
                onPress={() => hearWord(highlight.text)}
              />
            ))}
          </View>
          <Body size={type.caption} tone="muted">
            {clean} clean, {close} close. Tap a word to hear it.
          </Body>
        </View>
      ) : null}

      {weakSounds.length > 0 ? (
        <View style={styles.section}>
          <Eyebrow>Sounds to work on</Eyebrow>
          <View style={styles.chipsWrap}>
            {weakSounds.map(([soundId, symbol]) => (
              <Chip key={soundId} label={`${symbol} · see how`} status="needs-work" accessibilityHint="Shows where the tongue and lips go for this sound." onPress={() => openSound(soundId)} />
            ))}
          </View>
        </View>
      ) : null}

      {!compact && assessment.nextStep ? (
        <InfoPanel>
          <Eyebrow>Next cue</Eyebrow>
          <Body size={type.footnote}>{assessment.nextStep}</Body>
        </InfoPanel>
      ) : null}

      {assessment.phonemes.length > 0 ? (
        <Collapsible title={`Advanced breakdown · ${assessment.phonemes.length} sounds`}>
          <View style={styles.chipsWrap}>
            {assessment.phonemes.map((phoneme, index) => {
              const needsWork = phoneme.status === "needs-work";
              const soundId = soundIdForSymbol(phoneme.symbol);
              return (
                <Pressable
                  key={`${phoneme.symbol}-${index}`}
                  accessibilityRole={soundId ? "button" : undefined}
                  disabled={!soundId}
                  onPress={soundId ? () => openSound(soundId) : undefined}
                  accessibilityHint={soundId ? "Shows the mouth map for this sound." : undefined}
                  accessibilityLabel={`${phoneme.symbol}, expected ${phoneme.expected}, heard ${
                    phoneme.heard || "nothing"
                  }, ${normalizeScore(phoneme.accuracy)} percent`}
                  style={[
                    styles.phonemeCard,
                    { backgroundColor: needsWork ? colors.brick : overlays.yellowGreenPanel },
                  ]}>
                  <Title size={type.headline} onDark={needsWork}>
                    {phoneme.symbol}
                  </Title>
                  <Body size={type.caption} onDark={needsWork}>
                    {phonemeCaption(phoneme)}
                  </Body>
                </Pressable>
              );
            })}
          </View>
        </Collapsible>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    scoreHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
    },
    scoreHeaderText: {
      flex: 1,
      gap: spacing.xs,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    flexText: {
      flexShrink: 1,
    },
    panelRow: {
      gap: spacing.sm,
    },
    panel: {
      flex: 1,
    },
    ipa: {
      fontFamily: fonts.bodyMedium,
    },
    section: {
      gap: spacing.sm,
    },
    sectionHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    phonemeCard: {
      borderRadius: radii.tile,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: "center",
      minWidth: 64,
      gap: 2,
    },
  }),
);
