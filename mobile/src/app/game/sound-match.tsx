import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Play } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { ChoiceButton, type ChoiceState } from "@/components/games/ChoiceButton";
import { RoundSummary } from "@/components/games/RoundSummary";
import { ScoreStrip } from "@/components/games/ScoreStrip";
import { SpeakerButton } from "@/components/games/SpeakerButton";
import {
  Banner,
  Body,
  Button,
  Card,
  Chip,
  Eyebrow,
  HorizontalPicker,
  InfoPanel,
  Screen,
  SegmentedProgress,
  TopBar,
} from "@/components/ui";
import { ServerBanner } from "@/components/status";
import { MINIMAL_PAIRS, pairGroup } from "@/data/minimal-pairs";
import { EMPTY_TALLY, accuracy, buildSoundRounds, tallyAnswer, type SoundRound } from "@/games/quiz";
import { clockSeed, seededRng } from "@/games/random";
import { useGameProgress } from "@/games/store";
import { useExitGuard } from "@/hooks/useExitGuard";
import { useServerStatus } from "@/hooks/useServerStatus";
import { useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { colors, spacing, type, themed } from "@/theme/theme";

const ROUND_LENGTH = 10;
const ALL = "all";

export default function SoundMatchScreen() {
  const params = useLocalSearchParams<{ group?: string }>();
  const { progress, recordRound } = useGameProgress();
  const audio = useSpeech();
  const { speak, prefetch } = audio;
  const server = useServerStatus();

  const [groupKey, setGroupKey] = useState(() =>
    params.group && pairGroup(params.group) ? params.group : ALL,
  );
  const [rounds, setRounds] = useState<SoundRound[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [finished, setFinished] = useState(false);
  const [heardFor, setHeardFor] = useState<string | null>(null);
  const [previousBest, setPreviousBest] = useState(() => progress.bests["sound-match"] ?? 0);
  const recorded = useRef(false);

  const round = rounds?.[index];
  const answered = picked !== null;
  const correct = answered && picked === round?.target;
  const groupLabel = groupKey === ALL ? "All sounds" : (pairGroup(groupKey)?.label ?? "Sounds");
  const heard = round !== undefined && heardFor === round.id;

  useExitGuard(
    tally.answered > 0 && !finished,
    "Leave the listening round?",
    "This round's score will be lost. Finished rounds are saved automatically.",
  );

  // Each round plays its word as soon as it appears, and warms the next one.
  const upcoming = rounds?.[index + 1];
  useEffect(() => {
    if (!round || finished) return;
    let cancelled = false;
    const roundId = round.id;
    speak(round.target).then((ok) => {
      if (!cancelled && ok) setHeardFor(roundId);
    });
    if (upcoming) prefetch(upcoming.target);
    return () => {
      cancelled = true;
    };
  }, [round, upcoming, finished, speak, prefetch]);

  const percent = useMemo(() => accuracy(tally.correct, tally.answered), [tally]);

  function start() {
    const groups = groupKey === ALL ? MINIMAL_PAIRS : [pairGroup(groupKey)!];
    recorded.current = false;
    setRounds(buildSoundRounds(groups, ROUND_LENGTH, seededRng(clockSeed())));
    setIndex(0);
    setPicked(null);
    setTally(EMPTY_TALLY);
    setFinished(false);
  }

  function choose(word: string) {
    if (!round || answered) return;
    const right = word === round.target;
    setPicked(word);
    setTally((current) => tallyAnswer(current, right));
    if (right) haptics.success();
    else haptics.error();
    playAssessmentFeedback(right ? 100 : 0);
  }

  function next() {
    if (!rounds) return;
    audio.stop();
    if (index + 1 >= rounds.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  }

  function finish() {
    setFinished(true);
    if (recorded.current) return;
    recorded.current = true;
    if (percent >= 70) playCompletionSound();
    recordRound({
      gameId: "sound-match",
      score: tally.score,
      accuracy: percent,
      correct: tally.correct,
      total: tally.answered,
      label: groupLabel,
    });
  }

  function playAgain() {
    setPreviousBest((best) => Math.max(best, tally.score));
    start();
  }

  const eyebrow = `Sound Match · ${groupLabel}`;

  if (rounds === null) {
    const chosen = groupKey === ALL ? null : pairGroup(groupKey);
    return (
      <Screen>
        <TopBar closeLabel="Leave this game" eyebrow="Sound Match" title="Train your ear" onClose={() => router.back()} />

        <ServerBanner />

        <Card>
          <Eyebrow>Pick a contrast</Eyebrow>
          <Body size={type.callout}>
            You&apos;ll hear one word and pick which of the pair it was.
          </Body>
          <HorizontalPicker
            bleed={spacing.xl}
            selectedIndex={groupKey === ALL ? 0 : MINIMAL_PAIRS.findIndex((group) => group.key === groupKey) + 1}>
            <Chip label="All sounds" selected={groupKey === ALL} onPress={() => setGroupKey(ALL)} />
            {MINIMAL_PAIRS.map((group) => (
              <Chip
                key={group.key}
                label={group.label}
                selected={group.key === groupKey}
                onPress={() => setGroupKey(group.key)}
              />
            ))}
          </HorizontalPicker>
          <InfoPanel>
            <Body size={type.footnote}>
              {chosen
                ? chosen.blurb
                : "A mix of every contrast: R and L, V and W, the two TH sounds, tricky vowels and more."}
            </Body>
            {chosen ? (
              <Body size={type.caption} tone="muted">
                {chosen.pairs.map((pair) => `${pair[0]} / ${pair[1]}`).join(" · ")}
              </Body>
            ) : null}
          </InfoPanel>
          <Button
            label={`Start · ${ROUND_LENGTH} rounds`}
            icon={<Play color={colors.snow} size={16} />}
            disabled={!server.reachable}
            onPress={() => {
              haptics.tap();
              start();
            }}
          />
        </Card>
      </Screen>
    );
  }

  if (finished || !round) {
    return (
      <Screen>
        <TopBar closeLabel="Leave this game" eyebrow={eyebrow} title="Round over" onClose={() => router.back()} />
        <RoundSummary
          accuracy={percent}
          isNewBest={tally.score > previousBest && tally.score > 0}
          subtitle={
            percent >= 90
              ? "Your ear is sharp on these. Try a different contrast."
              : "Hearing the difference comes before saying it. Keep listening."
          }
          stats={[
            { label: "Score", value: String(tally.score) },
            { label: "Heard right", value: `${tally.correct}/${tally.answered}` },
            { label: "Best combo", value: `×${tally.bestStreak}` },
          ]}
          onPlayAgain={playAgain}
          onDone={() => setRounds(null)}
          doneLabel="Pick a contrast"
          playAgainLabel="Same again"
        />
      </Screen>
    );
  }

  function stateFor(word: string): ChoiceState {
    if (!answered) return "idle";
    if (word === round!.target) return "correct";
    if (word === picked) return "wrong";
    return "dimmed";
  }

  return (
    <Screen>
      <TopBar closeLabel="Leave this game"
        eyebrow={eyebrow}
        title={`Round ${index + 1} of ${rounds.length}`}
        onClose={() => router.back()}
      />
      <ScoreStrip score={tally.score} streak={tally.streak} />
      <SegmentedProgress total={rounds.length} currentIndex={index} />

      {audio.error ? (
        <Banner message={audio.error} tone="error" actionLabel="Try again" onAction={() => audio.speak(round.target)} />
      ) : null}

      <Card style={styles.prompt}>
        <Eyebrow>{round.groupLabel}</Eyebrow>
        <SpeakerButton
          onPress={() => audio.speak(round.target)}
          loading={audio.isLoading && audio.activeText === round.target}
          playing={audio.isPlaying && audio.activeText === round.target}
          label={heard ? "Hear it again" : "Play the word"}
          size={108}
        />
        <Body size={type.footnote} tone="muted">
          Which word did you hear?
        </Body>
      </Card>

      <View style={styles.options}>
        {round.pair.map((word) => (
          <ChoiceButton
            key={word}
            label={word}
            state={stateFor(word)}
            disabled={answered && !heard}
            onPress={() => (answered ? audio.toggle(word) : choose(word))}
          />
        ))}
      </View>

      {answered ? (
        <>
          <InfoPanel tone={correct ? "cream" : "white"}>
            <Eyebrow tone={correct ? undefined : colors.brick}>
              {correct ? "That's the one" : `It was “${round.target}”`}
            </Eyebrow>
            <Body size={type.footnote}>Tap either word to hear it again.</Body>
          </InfoPanel>
          <Button
            label={index + 1 >= rounds.length ? "See results" : "Next"}
            icon={<ArrowRight color={colors.snow} size={16} />}
            onPress={next}
          />
        </>
      ) : (
        <Body size={type.caption} tone="muted" style={styles.footer}>
          Not sure? Play it again first. There&apos;s no penalty.
        </Body>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    prompt: {
      alignItems: "center",
      gap: spacing.md,
    },
    options: {
      gap: spacing.sm,
    },
    footer: {
      textAlign: "center",
    },
  }),
);
