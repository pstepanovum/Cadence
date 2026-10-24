import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Lightbulb } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { RoundSummary } from "@/components/games/RoundSummary";
import { ScoreStrip } from "@/components/games/ScoreStrip";
import { SpeakerButton } from "@/components/games/SpeakerButton";
import {
  ActionRow,
  Banner,
  Body,
  Button,
  Card,
  Eyebrow,
  InfoPanel,
  Screen,
  SegmentedProgress,
  TextField,
  TopBar,
} from "@/components/ui";
import { levelLabel, parseLevel, vocabForLevel, type VocabWord } from "@/data/vocabulary";
import { EMPTY_TALLY, accuracy, pointsFor, tallyAnswer } from "@/games/quiz";
import { clockSeed, sample, seededRng } from "@/games/random";
import { useGameProgress } from "@/games/store";
import { checkSpelling, hintMask, letterCount, letterDiff } from "@/games/text";
import { useExitGuard } from "@/hooks/useExitGuard";
import { useServerStatus } from "@/hooks/useServerStatus";
import { useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, spacing, type } from "@/theme/theme";

const ROUND_LENGTH = 8;
const MAX_LIVES = 3;

type Verdict = { correct: boolean; close: boolean; typed: string } | null;

export default function SpellingScreen() {
  const params = useLocalSearchParams<{ level?: string }>();
  const level = parseLevel(params.level);
  const { progress, recordRound } = useGameProgress();
  const audio = useSpeech();
  const { speak, prefetch } = audio;
  const server = useServerStatus();

  const [words, setWords] = useState<VocabWord[]>(() =>
    sample(vocabForLevel(level), ROUND_LENGTH, seededRng(clockSeed())),
  );
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [lives, setLives] = useState(MAX_LIVES);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [heardFor, setHeardFor] = useState<string | null>(null);
  const [previousBest, setPreviousBest] = useState(() => progress.bests.spelling ?? 0);
  const recorded = useRef(false);

  const word = words[index];
  const letters = word ? letterCount(word.word) : 0;
  const usedHelp = revealed > 0 || showMeaning;
  const heardOnce = word !== undefined && heardFor === word.id;

  useExitGuard(
    tally.answered > 0 && !finished,
    "Leave the spelling bee?",
    "This round's score will be lost. Finished rounds are saved automatically.",
  );

  // Each new word is read out as soon as it arrives. If the audio cannot be
  // fetched, the meaning opens by itself so the round can carry on.
  const nextWord = words[index + 1];
  useEffect(() => {
    if (!word || finished) return;
    let cancelled = false;
    const wordId = word.id;
    speak(word.word).then((ok) => {
      if (cancelled) return;
      if (ok) setHeardFor(wordId);
      else setShowMeaning(true);
    });
    if (nextWord) prefetch(nextWord.word);
    return () => {
      cancelled = true;
    };
  }, [word, nextWord, finished, speak, prefetch]);

  const percent = useMemo(() => accuracy(tally.correct, tally.answered), [tally]);

  function submit() {
    if (!word || verdict) return;
    const check = checkSpelling(typed, word.word);
    if (!check.correct && typed.trim() === "") return;

    setVerdict({ correct: check.correct, close: check.close, typed });
    setResults((current) => ({ ...current, [word.id]: check.correct }));

    if (check.correct) {
      haptics.success();
      playAssessmentFeedback(100);
      setTally((current) => {
        const next = tallyAnswer(current, true);
        // Hints halve the points for that word.
        const earned = pointsFor(current.streak);
        return usedHelp ? { ...next, score: next.score - Math.ceil(earned / 2) } : next;
      });
    } else {
      haptics.error();
      playAssessmentFeedback(0);
      setTally((current) => tallyAnswer(current, false));
      setLives((current) => current - 1);
    }
  }

  function next() {
    audio.stop();
    if (index + 1 >= words.length || lives <= 0) {
      finish();
      return;
    }
    setIndex(index + 1);
    setTyped("");
    setRevealed(0);
    setShowMeaning(false);
    setVerdict(null);
  }

  function finish() {
    setFinished(true);
    if (recorded.current) return;
    recorded.current = true;
    if (percent >= 70) playCompletionSound();
    recordRound({
      gameId: "spelling",
      score: tally.score,
      accuracy: percent,
      correct: tally.correct,
      total: tally.answered,
      label: levelLabel(level),
    });
  }

  function playAgain() {
    recorded.current = false;
    setPreviousBest((best) => Math.max(best, tally.score));
    setWords(sample(vocabForLevel(level), ROUND_LENGTH, seededRng(clockSeed())));
    setIndex(0);
    setTyped("");
    setRevealed(0);
    setShowMeaning(false);
    setVerdict(null);
    setLives(MAX_LIVES);
    setTally(EMPTY_TALLY);
    setResults({});
    setFinished(false);
  }

  const eyebrow = `Spelling Bee · ${levelLabel(level)}`;

  if (finished || !word) {
    const attempted = words.filter((item) => item.id in results);
    return (
      <Screen>
        <TopBar
          closeLabel="Leave this game"
          eyebrow={eyebrow}
          title={lives <= 0 ? "Out of lives" : "Round over"}
          onClose={() => router.back()}
        />
        <RoundSummary
          accuracy={percent}
          isNewBest={tally.score > previousBest && tally.score > 0}
          subtitle={
            lives <= 0
              ? "Three misses ends the round. The words that got you are marked below."
              : tally.correct === tally.answered
                ? "Perfect spelling, every word."
                : "A hint halves the points for that word, but it beats a wrong guess."
          }
          stats={[
            { label: "Score", value: String(tally.score) },
            { label: "Spelled", value: `${tally.correct}/${tally.answered}` },
            { label: "Lives left", value: String(Math.max(0, lives)) },
          ]}
          items={attempted.map((item) => ({
            label: item.word,
            status: results[item.id] ? "correct" : "needs-work",
          }))}
          onPlayAgain={playAgain}
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  const diff = verdict && !verdict.correct ? letterDiff(verdict.typed, word.word) : null;

  return (
    <Screen>
        <TopBar closeLabel="Leave this game"
          eyebrow={eyebrow}
          title={`Word ${index + 1} of ${words.length}`}
          onClose={() => router.back()}
        />
        <ScoreStrip score={tally.score} streak={tally.streak} lives={lives} maxLives={MAX_LIVES} />
        <SegmentedProgress total={words.length} currentIndex={index} />

        {!server.reachable && !server.checking ? (
          <Banner
            tone="warning"
            message="Cadence can't reach your computer, so the words can't be read aloud. The meaning is shown instead."
            actionLabel={server.actionLabel ?? "Try again"}
            onAction={server.refresh}
          />
        ) : audio.error ? (
          <Banner
            message={audio.error}
            tone="warning"
            actionLabel="Try again"
            onAction={() => void audio.speak(word.word)}
          />
        ) : null}

        <Card style={styles.prompt}>
          <SpeakerButton
            onPress={() => audio.toggle(word.word)}
            loading={audio.isLoading}
            playing={audio.isPlaying}
            label={heardOnce ? "Hear it again" : "Hear the word"}
          />
          <Text style={styles.mask} maxFontSizeMultiplier={maxScale.title} accessibilityLabel={`${letters} letters`}>
            {hintMask(word.word, revealed)}
          </Text>
          <Body size={type.caption} tone="muted">
            {letters} {letters === 1 ? "letter" : "letters"}
            {word.word.includes(" ") ? " · two words" : ""}
          </Body>
          {showMeaning ? (
            <InfoPanel>
              <Eyebrow>Meaning</Eyebrow>
              <Body size={type.footnote}>{word.definition}</Body>
            </InfoPanel>
          ) : null}
        </Card>

        {verdict ? (
          <Card variant={verdict.correct ? "cream" : "light"} style={styles.verdict}>
            <Eyebrow tone={verdict.correct ? undefined : colors.brickText}>
              {verdict.correct
                ? usedHelp
                  ? "Right, with a hint"
                  : "Right"
                : verdict.close
                  ? "So close"
                  : "Not quite"}
            </Eyebrow>
            {diff ? (
              <View style={styles.diffRow} accessibilityLabel={`The correct spelling is ${word.word}`}>
                {diff.map((item, itemIndex) => (
                  <Text
                    key={itemIndex}
                    maxFontSizeMultiplier={maxScale.title}
                    style={[
                      styles.diffLetter,
                      item.status === "match" && styles.diffMatch,
                      item.status === "wrong" && styles.diffWrong,
                      item.status === "missing" && styles.diffMissing,
                    ]}>
                    {item.letter === " " ? " " : item.letter}
                  </Text>
                ))}
              </View>
            ) : (
              <Body size={type.title2} weight="bold" tone="strong">
                {word.word}
              </Body>
            )}
            {showMeaning ? null : <Body size={type.footnote}>{word.definition}</Body>}
            <Body size={type.footnote} tone="muted">
              “{word.example}”
            </Body>
            <Button
              label={index + 1 >= words.length || lives <= 0 ? "See results" : "Next word"}
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={next}
            />
          </Card>
        ) : (
          <>
            <TextField
              placeholder="Type what you heard"
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={submit}
              autoFocus
            />
            <Button label="Check spelling" onPress={submit} disabled={typed.trim() === ""} />
            <ActionRow>
              <Button
                label={revealed >= letters ? "All revealed" : "Reveal a letter"}
                variant="tonal"
                icon={<Lightbulb color={colors.hunter} size={16} />}
                disabled={revealed >= letters}
                onPress={() => setRevealed((value) => value + 1)}
              />
              <Button
                label={showMeaning ? "Meaning shown" : "Show meaning"}
                variant="tonal"
                disabled={showMeaning}
                onPress={() => setShowMeaning(true)}
              />
            </ActionRow>
            <Body size={type.caption} tone="muted" style={styles.footer}>
              A hint halves the points for this word.
            </Body>
          </>
        )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: {
    alignItems: "center",
    gap: spacing.md,
  },
  mask: {
    fontFamily: fonts.kickerBold,
    fontSize: 24,
    letterSpacing: 2,
    color: colors.hunter,
    textAlign: "center",
  },
  verdict: {
    gap: spacing.sm,
  },
  diffRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  diffLetter: {
    fontFamily: fonts.kickerBold,
    fontSize: 24,
    minWidth: 22,
    textAlign: "center",
    borderRadius: radii.tile,
    paddingHorizontal: spacing.xs,
    overflow: "hidden",
    color: colors.hunter,
  },
  diffMatch: {
    backgroundColor: colors.yellowGreen,
    color: colors.ink,
  },
  diffWrong: {
    backgroundColor: colors.brick,
    color: colors.snow,
  },
  diffMissing: {
    backgroundColor: colors.platinum,
    color: colors.slate,
  },
  footer: {
    textAlign: "center",
  },
});
