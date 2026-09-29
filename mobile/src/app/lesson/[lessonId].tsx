import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ArrowRight, RotateCcw, Volume2, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, useWindowDimensions, View } from "react-native";
import RenderHtml from "react-native-render-html";
import { SvgXml } from "react-native-svg";
import {
  assess,
  createSession,
  finishSession,
  getLessons,
  recordAttempt,
  submitExamScore,
  type RecordedAudio,
} from "@/api/endpoints";
import type { LessonWithSummary, PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { getReferenceAudio, prefetchReferenceAudio } from "@/audio/reference-audio";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  InfoPanel,
  PillButton,
  ProgressRing,
  RoundIconButton,
  Screen,
  ScreenState,
  SegmentedProgress,
  StatTile,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_SUCCESS } from "@/data/svg";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { usePlayback } from "@/hooks/usePlayback";
import { describeError } from "@/hooks/useServerStatus";
import { didPass, lessonAfter, passMark } from "@/practice/progression";
import { averageScore, bestScore, normalizeScore, scoreStatus } from "@/practice/scoring";
import { colors, fonts, radii, spacing } from "@/theme/theme";

export default function LessonScreen() {
  const { lessonId, moduleId } = useLocalSearchParams<{ lessonId: string; moduleId: string }>();
  const numericModuleId = Number(moduleId);

  const lessonsQuery = useQuery({
    queryKey: ["lessons", numericModuleId],
    queryFn: () => getLessons(numericModuleId),
    enabled: Number.isFinite(numericModuleId),
  });

  const lessons = lessonsQuery.data ?? [];
  const lesson = lessons.find((item) => item.id === lessonId);

  return (
    <Screen>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          {lesson ? <Eyebrow>{lesson.lesson_type}</Eyebrow> : null}
          <Title size={22}>{lesson?.title ?? "Lesson"}</Title>
        </View>
        <RoundIconButton accessibilityLabel="Close lesson" onPress={() => router.back()}>
          <X color={colors.hunter} size={20} />
        </RoundIconButton>
      </View>

      <ScreenState
        isLoading={lessonsQuery.isLoading}
        isError={lessonsQuery.isError}
        errorMessage={describeError(lessonsQuery.error, "Could not load this lesson.")}
        onRetry={() => lessonsQuery.refetch()}
        isEmpty={lessonsQuery.isSuccess && !lesson}
        loadingRows={3}
        loadingLabel="Loading the lesson…"
        empty={{
          title: "Lesson not found",
          message: "This lesson is no longer part of the module. Head back and pick another one.",
          actionLabel: "Back to lessons",
          onAction: () => router.back(),
        }}>
        {lesson?.lesson_type === "theory" ? (
          <TheoryLesson lesson={lesson} lessons={lessons} moduleId={numericModuleId} />
        ) : lesson ? (
          <WordQueueLesson lesson={lesson} lessons={lessons} moduleId={numericModuleId} />
        ) : null}
      </ScreenState>
    </Screen>
  );
}

// --- Theory -----------------------------------------------------------------

function TheoryLesson({
  lesson,
  lessons,
  moduleId,
}: {
  lesson: LessonWithSummary;
  lessons: LessonWithSummary[];
  moduleId: number;
}) {
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const playback = usePlayback();
  const { instruct } = useCoachVoice();

  const [loadingNarration, setLoadingNarration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const plainText = (lesson.theory_html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // The TTS route is happiest with a couple of paragraphs at a time.
  const narration = plainText.slice(0, 600);
  const next = lessonAfter(lessons, lesson.id);
  const alreadyRead = lesson.session_summary != null;

  // Warm the narration so the button plays straight away, as the web app does.
  useEffect(() => {
    if (narration) prefetchReferenceAudio(narration, instruct);
  }, [narration, instruct]);

  async function toggleNarration() {
    if (playback.isPlaying || playback.isLoading) {
      playback.stop();
      return;
    }
    setError(null);
    setLoadingNarration(true);
    try {
      const uri = await getReferenceAudio(narration, instruct);
      await playback.play(uri);
    } catch (cause) {
      setError(describeError(cause, "Could not load the narration audio."));
    } finally {
      setLoadingNarration(false);
    }
  }

  /**
   * Theory has nothing to score, but the exam stays locked until every lesson
   * before it has a finished session — so reading it has to close one, or the
   * module can never be completed.
   */
  async function markAsRead() {
    setMarking(true);
    setMarkError(null);
    try {
      const { sessionId } = await createSession(lesson.id, moduleId);
      await finishSession(sessionId, { word_count: 0, avg_score: 0, passed: true });
      await queryClient.invalidateQueries({ queryKey: ["lessons", moduleId] });
      playback.stop();
      if (next) {
        router.replace({
          pathname: "/lesson/[lessonId]",
          params: { lessonId: next.id, moduleId: String(moduleId) },
        });
      } else {
        router.back();
      }
    } catch (cause) {
      setMarkError(
        describeError(cause, "Could not save your progress. Check your connection and try again."),
      );
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <Card>
        {narration ? (
          <PillButton
            label={playback.isPlaying ? "Stop narration" : "Listen to this lesson"}
            variant="secondary"
            loading={loadingNarration}
            icon={<Volume2 color={colors.hunter} size={16} />}
            onPress={toggleNarration}
          />
        ) : null}
        {error ? <Banner message={error} tone="error" /> : null}

        {lesson.theory_html ? (
          <RenderHtml
            contentWidth={width - spacing.lg * 2 - spacing.xl * 2}
            source={{ html: lesson.theory_html }}
            baseStyle={{
              color: colors.iron,
              fontFamily: fonts.body,
              fontSize: 14,
              lineHeight: 21,
            }}
            tagsStyles={{
              h1: { color: colors.hunter, fontFamily: fonts.kicker, fontSize: 22, lineHeight: 28 },
              h2: { color: colors.hunter, fontFamily: fonts.kicker, fontSize: 19, lineHeight: 25 },
              h3: { color: colors.hunter, fontFamily: fonts.kicker, fontSize: 16, lineHeight: 22 },
              strong: { fontFamily: fonts.bodyBold, color: colors.hunter },
              li: { marginBottom: 4 },
            }}
          />
        ) : (
          <InfoPanel>
            <Body size={13}>
              There is no written theory for this lesson yet — go straight to the practice below it.
            </Body>
          </InfoPanel>
        )}
      </Card>

      {markError ? (
        <Banner message={markError} tone="error" actionLabel="Try again" onAction={markAsRead} />
      ) : null}

      <PillButton
        label={next ? "Mark as read and continue" : "Mark as read"}
        loading={marking}
        icon={<ArrowRight color={colors.snow} size={16} />}
        onPress={markAsRead}
      />
      {alreadyRead ? (
        <Body size={12} style={styles.centerText}>
          You have already read this one — marking it again is harmless.
        </Body>
      ) : null}
    </>
  );
}

// --- Practice and exam ------------------------------------------------------

function WordQueueLesson({
  lesson,
  lessons,
  moduleId,
}: {
  lesson: LessonWithSummary;
  lessons: LessonWithSummary[];
  moduleId: number;
}) {
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const readiness = useAssessReadiness();

  const isExam = lesson.lesson_type === "exam";
  const words = lesson.words;
  const pass = passMark(lesson.lesson_type);

  const [wordIndex, setWordIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [scores, setScores] = useState<number[]>([]);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Every take across every word — shown on the summary, hence state. */
  const [totalTakes, setTotalTakes] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const currentWord = words[wordIndex];
  const inProgress = !finished && (scores.length > 0 || assessment !== null);

  // Open a session up front so attempts have something to attach to.
  useEffect(() => {
    let cancelled = false;
    createSession(lesson.id, moduleId)
      .then((result) => {
        if (!cancelled) sessionIdRef.current = result.sessionId;
      })
      .catch(() => {
        // Recorded below as a save error if the run actually finishes.
      });
    return () => {
      cancelled = true;
    };
  }, [lesson.id, moduleId]);

  // Leaving mid-run throws the round away, so ask first.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!inProgress) return;
      event.preventDefault();
      Alert.alert(
        isExam ? "Leave the exam?" : "Leave this lesson?",
        `You have scored ${scores.length} of ${words.length} words. Leaving now discards the round.`,
        [
          { text: "Keep practising", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => navigation.dispatch(event.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, inProgress, isExam, scores.length, words.length]);

  const handleTake = useCallback(
    async (take: RecordedAudio) => {
      if (!currentWord) return;
      setError(null);
      try {
        const result = await assess(take, currentWord.word);
        setAssessment(result);
        playAssessmentFeedback(result.overallScore);
        const attemptNumber = totalTakes + 1;
        setTotalTakes(attemptNumber);
        recordAttempt({
          lesson_id: lesson.id,
          lesson_word_id: currentWord.id,
          word: currentWord.word,
          score: normalizeScore(result.overallScore),
          ipa_target: result.ipaTarget,
          ipa_transcript: result.transcript,
          phoneme_detail: { phonemes: result.phonemes, highlights: result.highlights },
          attempt_number: attemptNumber,
        }).catch(() => {
          // Attempt logging feeds the stats page only; never block the lesson.
        });
      } catch (cause) {
        const message = describeError(cause, "Scoring failed. Try that take again.");
        setError(message);
        throw new Error(message);
      }
    },
    [currentWord, lesson.id, totalTakes],
  );

  function retryWord() {
    setAssessment(null);
    setError(null);
    setAttempt((value) => value + 1);
  }

  const finishRun = useCallback(
    async (finalScores: number[]) => {
      const avg = averageScore(finalScores);
      const passed = didPass(lesson.lesson_type, finalScores);
      setSaving(true);
      setSaveError(null);
      try {
        if (!sessionIdRef.current) {
          const created = await createSession(lesson.id, moduleId);
          sessionIdRef.current = created.sessionId;
        }
        await finishSession(sessionIdRef.current, {
          word_count: finalScores.length,
          // Practice rounds always count as finished; only the exam gates.
          avg_score: avg,
          passed: isExam ? passed : true,
        });
        if (isExam) {
          await submitExamScore(moduleId, avg);
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["modules"] }),
          queryClient.invalidateQueries({ queryKey: ["lessons", moduleId] }),
          queryClient.invalidateQueries({ queryKey: ["stats"] }),
        ]);
      } catch (cause) {
        setSaveError(
          describeError(
            cause,
            "Your score could not be saved. Check your connection and try again.",
          ),
        );
      } finally {
        setSaving(false);
      }
    },
    [isExam, lesson.id, lesson.lesson_type, moduleId, queryClient],
  );

  async function advance() {
    if (!assessment) return;
    const nextScores = [...scores, normalizeScore(assessment.overallScore)];
    setScores(nextScores);
    setAssessment(null);
    setError(null);

    if (wordIndex + 1 < words.length) {
      setWordIndex(wordIndex + 1);
      setAttempt(1);
      return;
    }

    setFinished(true);
    if (averageScore(nextScores) >= pass) playCompletionSound();
    await finishRun(nextScores);
  }

  if (!currentWord && !finished) {
    return (
      <Banner
        tone="warning"
        message="This lesson has no practice words yet."
        actionLabel="Back to lessons"
        onAction={() => router.back()}
      />
    );
  }

  if (finished) {
    const avg = averageScore(scores);
    const passed = didPass(lesson.lesson_type, scores);
    const next = lessonAfter(lessons, lesson.id);

    return (
      <>
        <Card style={styles.summaryCard}>
          <Eyebrow>{isExam ? "Exam result" : "Lesson complete"}</Eyebrow>
          <ProgressRing score={avg} size={104} strokeWidth={9} />
          <Title size={22} style={styles.centerText}>
            {passed ? (isExam ? "You passed the exam!" : "Great work!") : "Keep practising"}
          </Title>
          <Body size={13} style={styles.centerText}>
            {isExam
              ? passed
                ? "The next module is now unlocked."
                : `You need ${pass} or higher to unlock the next module.`
              : `Average across ${scores.length} ${scores.length === 1 ? "word" : "words"}.`}
          </Body>

          <View style={styles.statsRow}>
            <StatTile label="Average" value={String(avg)} />
            <StatTile label="Best" value={String(bestScore(scores))} />
            <StatTile label="Takes" value={String(totalTakes)} />
          </View>

          <View style={styles.summaryChips}>
            {words.map((word, index) => (
              <Chip
                key={word.id}
                label={`${word.word} · ${scores[index] ?? "—"}`}
                status={scores[index] == null ? "neutral" : scoreStatus(scores[index])}
              />
            ))}
          </View>

          {passed ? (
            <SvgXml xml={ILLUSTRATION_SUCCESS} width={168} height={168} />
          ) : null}
        </Card>

        {saveError ? (
          <Banner
            message={saveError}
            tone="error"
            actionLabel={saving ? undefined : "Save again"}
            onAction={() => finishRun(scores)}
          />
        ) : null}

        <PillButton
          label={isExam && !passed ? "Retake the exam" : "Practise again"}
          variant="ghost"
          icon={<RotateCcw color={colors.hunter} size={16} />}
          onPress={() => {
            sessionIdRef.current = null;
            setTotalTakes(0);
            setScores([]);
            setWordIndex(0);
            setAttempt(1);
            setAssessment(null);
            setFinished(false);
            setSaveError(null);
            createSession(lesson.id, moduleId)
              .then((result) => {
                sessionIdRef.current = result.sessionId;
              })
              .catch(() => {});
          }}
        />
        {next ? (
          <PillButton
            label={`Next: ${next.title}`}
            icon={<ArrowRight color={colors.snow} size={16} />}
            onPress={() =>
              router.replace({
                pathname: "/lesson/[lessonId]",
                params: { lessonId: next.id, moduleId: String(moduleId) },
              })
            }
          />
        ) : (
          <PillButton label="Back to lessons" onPress={() => router.back()} />
        )}
      </>
    );
  }

  return (
    <>
      <Card>
        <View style={styles.progressHeader}>
          <Eyebrow tone={isExam ? colors.brick : undefined}>
            Word {wordIndex + 1} of {words.length}
          </Eyebrow>
          {isExam ? <Chip label={`Exam · pass ${pass}`} status="needs-work" /> : null}
        </View>
        <SegmentedProgress total={words.length} currentIndex={wordIndex} />

        <View style={styles.wordPanel}>
          <Title size={32}>{currentWord.word}</Title>
          <Body size={16} style={{ fontFamily: fonts.bodyMedium }}>
            {currentWord.ipa}
          </Body>
        </View>

        <View style={styles.statsRow}>
          <StatTile label="Attempt" value={String(attempt)} />
          <StatTile label="Scored" value={`${scores.length}/${words.length}`} />
          <StatTile label="Left" value={String(words.length - wordIndex - 1)} />
        </View>

        {!readiness.ready && readiness.message ? (
          <Banner
            tone={readiness.offline ? "error" : "warning"}
            message={readiness.message}
            actionLabel={readiness.offline ? "Try again" : undefined}
            onAction={readiness.offline ? readiness.refresh : undefined}
          />
        ) : null}

        <RecorderPanel
          key={`${currentWord.id}-${attempt}`}
          // No reference audio in the exam: that is the point of an exam.
          targetText={isExam ? undefined : currentWord.word}
          onTake={handleTake}
          disabled={!readiness.ready}
          statusHint={
            isExam
              ? "Exam mode: read the word once, carefully."
              : "Tap the microphone and read the word out loud."
          }
        />
      </Card>

      {error ? <Banner message={error} tone="error" /> : null}

      {assessment ? (
        <Card>
          <AssessmentView assessment={assessment} />
          <View style={styles.actionRow}>
            <PillButton
              label="Try again"
              variant="ghost"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={retryWord}
              style={styles.actionButton}
            />
            <PillButton
              label={wordIndex + 1 < words.length ? "Next word" : isExam ? "Submit exam" : "Finish"}
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={advance}
              style={styles.actionButton}
            />
          </View>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  topBarText: {
    flex: 1,
    gap: spacing.xs,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  wordPanel: {
    borderRadius: radii.card,
    backgroundColor: colors.cream,
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryCard: {
    alignItems: "center",
    gap: spacing.lg,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  centerText: {
    textAlign: "center",
  },
});
