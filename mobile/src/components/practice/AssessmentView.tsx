import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { PronunciationAssessment } from "@/api/types";
import { getReferenceAudio } from "@/audio/reference-audio";
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
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { usePlayback } from "@/hooks/usePlayback";
import { normalizeScore, phonemeCaption, scoreLabel, scoreStatus } from "@/practice/scoring";
import { colors, fonts, overlays, radii, spacing } from "@/theme/theme";

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
  const playback = usePlayback();
  const { instruct } = useCoachVoice();
  const [wordError, setWordError] = useState<string | null>(null);
  const [playingWord, setPlayingWord] = useState<string | null>(null);

  const clean = assessment.highlights.filter((item) => item.status === "correct").length;
  const close = assessment.highlights.filter((item) => item.status === "mixed").length;
  const total = assessment.highlights.length;

  async function hearWord(word: string) {
    const target = word.replace(/[^\p{L}\p{N}'-]/gu, "").trim();
    if (!target) return;
    if (playingWord === target) {
      playback.stop();
      setPlayingWord(null);
      return;
    }
    setWordError(null);
    setPlayingWord(target);
    try {
      const uri = await getReferenceAudio(target, instruct);
      await playback.play(uri, () => setPlayingWord(null));
    } catch {
      setWordError("Could not load that word's reference audio.");
      setPlayingWord(null);
    }
  }

  return (
    <View style={styles.container}>
      {compact ? (
        <View style={styles.scoreRow}>
          <Chip label={`Score ${score}/100`} status={scoreStatus(score)} />
          <Body size={13} weight="medium" style={styles.flexText}>
            {scoreLabel(score)}
          </Body>
        </View>
      ) : (
        <View style={styles.scoreHeader}>
          <ProgressRing score={score} size={92} strokeWidth={7} />
          <View style={styles.scoreHeaderText}>
            <Eyebrow>Assessment score</Eyebrow>
            <Title size={24}>{score}/100</Title>
            <Body size={13}>{assessment.summary || scoreLabel(score)}</Body>
          </View>
        </View>
      )}

      {!compact ? (
        <View style={styles.panelRow}>
          <InfoPanel style={styles.panel}>
            <Eyebrow>Target</Eyebrow>
            <Body weight="semibold" size={14}>
              {assessment.targetText}
            </Body>
            {assessment.ipaTarget ? (
              <Body size={13} style={styles.ipa}>
                {assessment.ipaTarget}
              </Body>
            ) : null}
          </InfoPanel>
          <InfoPanel style={styles.panel}>
            <Eyebrow>Decoded phonemes</Eyebrow>
            <Body size={13} style={styles.ipa}>
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
          {wordError ? <Banner message={wordError} tone="error" /> : null}
          <View style={styles.chipsWrap}>
            {assessment.highlights.map((highlight, index) => (
              <Chip
                key={`${highlight.text}-${index}`}
                label={highlight.text}
                status={highlight.status}
                active={playingWord === highlight.text.replace(/[^\p{L}\p{N}'-]/gu, "").trim()}
                accessibilityHint={
                  highlight.feedback
                    ? `${highlight.feedback}. Tap to hear this word.`
                    : "Tap to hear this word."
                }
                onPress={() => hearWord(highlight.text)}
              />
            ))}
          </View>
          <Body size={12}>
            {clean} {clean === 1 ? "word was" : "words were"} clean, {close} came close, and the rest
            need another pass. Tap any word to hear it.
          </Body>
        </View>
      ) : null}

      {!compact && assessment.nextStep ? (
        <InfoPanel>
          <Eyebrow>Next cue</Eyebrow>
          <Body size={13}>{assessment.nextStep}</Body>
        </InfoPanel>
      ) : null}

      {assessment.phonemes.length > 0 ? (
        <Collapsible title={`Advanced breakdown · ${assessment.phonemes.length} sounds`}>
          <View style={styles.chipsWrap}>
            {assessment.phonemes.map((phoneme, index) => {
              const needsWork = phoneme.status === "needs-work";
              return (
                <View
                  key={`${phoneme.symbol}-${index}`}
                  accessible
                  accessibilityLabel={`${phoneme.symbol}, expected ${phoneme.expected}, heard ${
                    phoneme.heard || "nothing"
                  }, ${normalizeScore(phoneme.accuracy)} percent`}
                  style={[
                    styles.phonemeCard,
                    { backgroundColor: needsWork ? colors.brick : overlays.yellowGreenPanel },
                  ]}>
                  <Title size={18} onDark={needsWork}>
                    {phoneme.symbol}
                  </Title>
                  <Body size={11} onDark={needsWork}>
                    {phonemeCaption(phoneme)}
                  </Body>
                </View>
              );
            })}
          </View>
        </Collapsible>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: radii.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    minWidth: 64,
    gap: 2,
  },
});
