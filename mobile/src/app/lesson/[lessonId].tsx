import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, RotateCcw, Square, Volume2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import RenderHtml from "react-native-render-html";
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
import { logPractice, useSessionClock } from "@/learning/log";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import { ResultSummary } from "@/components/practice/ResultSummary";
import { ReadinessBanner } from "@/components/status";
import {
  ActionRow,
  Banner,
  Body,
  Button,
  buttonIconColor,
  Card,
  Chip,
  InfoPanel,
  Screen,
  ScreenState,
  SegmentedProgress,
  Title,
  TopBar,
} from "@/components/ui";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { useExitGuard } from "@/hooks/useExitGuard";
import { describeError } from "@/hooks/useServerStatus";
import { useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { htmlToPlainText, narrationChunks } from "@/practice/narration";
import { didPass, lessonAfter, passMark } from "@/practice/progression";
import { averageScore, bestScore, normalizeScore, scoreStatus } from "@/practice/scoring";
import { colors, fonts, maxScale, radii, spacing, type, themed } from "@/theme/theme";

const MAX_CONTENT_WIDTH = 640;

// Module constants: RenderHtml rebuilds its whole tree when these change identity.
const HTML_TEXT_PROPS = { maxFontSizeMultiplier: maxScale.body };
const HTML_BASE_STYLE = themed(() => ({
  color: colors.iron,
  fontFamily: fonts.body,
  fontSize: type.body,
  lineHeight: 23,
}));
const HTML_TAG_STYLES = themed(() => ({
  h1: { color: colors.hunter, fontFamily: fonts.kicker, fontSize: type.title2, lineHeight: 28 },
  h2: { color: colors.hunter, fontFamily: fonts.kicker, fontSize: type.title3, lineHeight: 26 },
  h3: { color: colors.hunter, fontFamily: fonts.kicker, fontSize: type.headline, lineHeight: 22 },
  strong: { fontFamily: fonts.bodyBold, color: colors.hunter },
  em: { fontFamily: fonts.bodyMedium, fontStyle: "normal" as const, color: colors.hunter },
  li: { marginBottom: spacing.xs },
}));

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

  if (lesson?.lesson_type === "theory") {
    return (
      <Screen>
        <TheoryLesson lesson={lesson} lessons={lessons} moduleId={numericModuleId} />
      </Screen>
    );
  }
  if (lesson) {
    return (
      <Screen>
        <WordQueueLesson lesson={lesson} lessons={lessons} moduleId={numericModuleId} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onClose={() => router.back()} closeLabel="Close lesson" title="Lesson" />
      <ScreenState
        isLoading={lessonsQuery.isLoading}
        isError={lessonsQuery.isError}
        errorMessage={describeError(lessonsQuery.error, "Could not load this lesson.")}
        onRetry={() => void lessonsQuery.refetch()}
        isEmpty={lessonsQuery.isSuccess}
        loadingRows={3}
        loadingLabel="Loading the lesson…"
        empty={{
          title: "Lesson not found",
          message: "This lesson is no longer part of the module.",
          actionLabel: "Back to lessons",
          onAction: () => router.back(),
        }}>
        {null}
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
  const speech = useSpeech();
  const { speakAll, prefetch, stop } = speech;

  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  // The whole lesson, read as a queue of sentence-sized pieces.
  const chunks = useMemo(
    () => narrationChunks(htmlToPlainText(lesson.theory_html ?? "")),
    [lesson.theory_html],
  );
  const htmlSource = useMemo(() => ({ html: lesson.theory_html ?? "" }), [lesson.theory_html]);
  const narrating = speech.activeText !== null && chunks.includes(speech.activeText);
  const next = lessonAfter(lessons, lesson.id);
  const alreadyRead = lesson.session_summary != null;

  // Warm the first piece so the button plays straight away.
  useEffect(() => {
    if (chunks[0]) prefetch(chunks[0]);
  }, [chunks, prefetch]);

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
      stop();
      haptics.success();
      if (next) {
        router.replace({
          pathname: "/lesson/[lessonId]",
          params: { lessonId: next.id, moduleId: String(moduleId) },
        });
      } else {
        router.back();
      }
    } catch (cause) {
      haptics.error();
      setMarkError(describeError(cause, "Could not save your progress. Check your connection and try again."));
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <TopBar
        onClose={() => {
          stop();
          router.back();
        }}
        closeLabel="Close lesson"
        eyebrow="Theory"
        title={lesson.title}
      />

      <Card>
        {chunks.length > 0 ? (
          <Button
            label={narrating ? "Stop listening" : "Listen to this lesson"}
            variant="secondary"
            loading={narrating && speech.isLoading}
            icon={
              narrating ? (
                <Square color={buttonIconColor("secondary")} size={14} fill={buttonIconColor("secondary")} />
              ) : (
                <Volume2 color={buttonIconColor("secondary")} size={16} />
              )
            }
            onPress={() => (narrating ? stop() : speakAll(chunks))}
          />
        ) : null}
        {speech.error ? <Banner message={speech.error} tone="error" /> : null}

        {lesson.theory_html ? (
          <RenderHtml
            contentWidth={Math.min(width, MAX_CONTENT_WIDTH) - spacing.lg * 2 - spacing.xl * 2}
            source={htmlSource}
            defaultTextProps={HTML_TEXT_PROPS}
            baseStyle={HTML_BASE_STYLE}
            tagsStyles={HTML_TAG_STYLES}
          />
        ) : (
          <InfoPanel>
            <Body size={type.footnote}>There is no written theory for this lesson yet.</Body>
          </InfoPanel>
        )}
      </Card>

      {markError ? (
        <Banner message={markError} tone="error" actionLabel="Try again" onAction={markAsRead} />
      ) : null}

      <Button
        label={next ? "Mark as read and continue" : "Mark as read"}
        loading={marking}
        icon={<ArrowRight color={colors.snow} size={16} />}
        onPress={markAsRead}
      />
      {alreadyRead ? (
        <Body size={type.caption} tone="muted" style={styles.centerText}>
          You have read this one already.
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
  const elapsed = useSessionClock();
  const queryClient = useQueryClient();
  const readiness = useAssessReadiness();

  const isExam = lesson.lesson_type === "exam";
  const words = lesson.words;
  const pass = passMark(lesson.lesson_type);

  const [wordIndex, setWordIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [scores, setScores] = useState<number[]>([]);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Every take across every word — shown on the summary, hence state. */
  const [totalTakes, setTotalTakes] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const currentWord = words[wordIndex];
  const inProgress = !finished && (scores.length > 0 || assessment !== null);
  const unsaved = finished && (saving || saveError !== null);

  useExitGuard(
    inProgress || unsaved,
    unsaved ? "Your score isn't saved" : isExam ? "Leave the exam?" : "Leave this lesson?",
    unsaved
      ? "Leaving now loses this result. Stay and save it again?"
      : `You have scored ${scores.length} of ${words.length} words. Leaving now discards the round.`,
    { stayLabel: unsaved ? "Stay" : "Keep practising" },
  );

  // Attempts attach to a session. If opening one fails here, `finishRun`
  // opens it again before saving and reports the error there.
  const openSession = useCallback(() => {
    sessionIdRef.current = null;
    createSession(lesson.id, moduleId)
      .then((result) => {
        sessionIdRef.current = result.sessionId;
      })
      .catch(() => {
        sessionIdRef.current = null;
      });
  }, [lesson.id, moduleId]);

  useEffect(() => {
    openSession();
  }, [openSession]);

  const handleTake = useCallback(
    async (take: RecordedAudio) => {
      if (!currentWord) return;
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
        // Shown once, in the recorder's status line.
        throw new Error(describeError(cause, "Scoring failed. Try that take again."));
      }
    },
    [currentWord, lesson.id, totalTakes],
  );

  function retryWord() {
    setAssessment(null);
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
        haptics.error();
        setSaveError(
          describeError(cause, "Your score could not be saved. Check your connection and try again."),
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

    if (wordIndex + 1 < words.length) {
      setWordIndex(wordIndex + 1);
      setAttempt(1);
      return;
    }

    setFinished(true);
    logPractice({ kind: "pronunciation", refId: `module.${lesson.id}`, level: null, score: Math.round(averageScore(nextScores)), minutes: elapsed() });
    if (averageScore(nextScores) >= pass) {
      playCompletionSound();
      haptics.success();
    }
    await finishRun(nextScores);
  }

  function restart() {
    setTotalTakes(0);
    setScores([]);
    setWordIndex(0);
    setAttempt(1);
    setAssessment(null);
    setFinished(false);
    setSaveError(null);
    openSession();
  }

  const close = () => router.back();
  const kind = isExam ? "Exam" : "Practice";

  if (!currentWord && !finished) {
    return (
      <>
        <TopBar onClose={close} closeLabel="Close lesson" eyebrow={kind} title={lesson.title} />
        <Banner
          tone="warning"
          message="This lesson has no practice words yet."
          actionLabel="Back to lessons"
          onAction={close}
        />
      </>
    );
  }

  if (finished) {
    const avg = averageScore(scores);
    const passed = didPass(lesson.lesson_type, scores);
    const next = lessonAfter(lessons, lesson.id);

    return (
      <>
        <TopBar onClose={close} closeLabel="Close lesson" eyebrow={kind} title={lesson.title} />
        <ResultSummary
          eyebrow={isExam ? "Exam result" : "Lesson complete"}
          score={avg}
          title={passed ? (isExam ? "You passed the exam!" : "Great work!") : "Keep practising"}
          subtitle={
            isExam
              ? passed
                ? "The next module is now unlocked."
                : `You need ${pass} or higher to unlock the next module.`
              : `Average across ${scores.length} ${scores.length === 1 ? "word" : "words"}.`
          }
          stats={[
            { label: "Average", value: String(avg) },
            { label: "Best", value: String(bestScore(scores)) },
            { label: "Takes", value: String(totalTakes) },
          ]}
          items={words.map((word, index) => ({
            label: `${word.word} · ${scores[index] ?? "—"}`,
            status: scores[index] == null ? "neutral" : scoreStatus(scores[index]),
          }))}
          celebrate={passed}>
          {saveError ? (
            <Banner
              message={saveError}
              tone="error"
              actionLabel={saving ? undefined : "Save again"}
              onAction={() => void finishRun(scores)}
              style={styles.summaryBanner}
            />
          ) : null}
          <ActionRow>
            <Button
              label={isExam && !passed ? "Retake exam" : "Practise again"}
              variant="tonal"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={restart}
            />
            {next ? (
              <Button
                label="Next lesson"
                accessibilityHint={next.title}
                icon={<ArrowRight color={colors.snow} size={16} />}
                disabled={saving}
                onPress={() =>
                  router.replace({
                    pathname: "/lesson/[lessonId]",
                    params: { lessonId: next.id, moduleId: String(moduleId) },
                  })
                }
              />
            ) : (
              <Button label="Back to lessons" disabled={saving} onPress={close} />
            )}
          </ActionRow>
        </ResultSummary>
      </>
    );
  }

  return (
    <>
      <TopBar
        onClose={close}
        closeLabel="Close lesson"
        eyebrow={`${kind} · Word ${wordIndex + 1} of ${words.length}`}
        title={lesson.title}
      />
      <SegmentedProgress total={words.length} currentIndex={wordIndex} />

      <Card>
        <View style={styles.wordPanel}>
          {isExam ? <Chip label={`Pass mark ${pass}`} status="needs-work" /> : null}
          <Title size={type.display} style={styles.centerText}>
            {currentWord.word}
          </Title>
          <Body size={type.headline} style={styles.ipa}>
            {currentWord.ipa}
          </Body>
          {attempt > 1 ? (
            <Body size={type.caption} tone="muted">
              Attempt {attempt}
            </Body>
          ) : null}
        </View>

        <ReadinessBanner readiness={readiness} />

        <RecorderPanel
          key={`${currentWord.id}-${attempt}`}
          // No reference audio in the exam: that is the point of an exam.
          targetText={isExam ? undefined : currentWord.word}
          onTake={handleTake}
          disabled={!readiness.ready}
          statusHint={
            isExam ? "Exam: read the word once, carefully." : "Tap the microphone and read the word out loud."
          }
        />
      </Card>

      {assessment ? (
        <Card>
          <AssessmentView assessment={assessment} />
          <ActionRow>
            <Button
              label="Try again"
              variant="tonal"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={retryWord}
            />
            <Button
              label={wordIndex + 1 < words.length ? "Next word" : isExam ? "Submit exam" : "Finish"}
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={advance}
            />
          </ActionRow>
        </Card>
      ) : null}
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wordPanel: {
      borderRadius: radii.panel,
      backgroundColor: colors.cream,
      alignItems: "center",
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      gap: spacing.xs,
    },
    ipa: {
      fontFamily: fonts.bodyMedium,
    },
    summaryBanner: {
      marginBottom: spacing.sm,
    },
    centerText: {
      textAlign: "center",
    },
  }),
);
