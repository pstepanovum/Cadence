import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Play } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { ChoiceButton, type ChoiceState } from "@/components/games/ChoiceButton";
import { GameTopBar } from "@/components/games/GameTopBar";
import { RoundSummary } from "@/components/games/RoundSummary";
import { ScoreStrip } from "@/components/games/ScoreStrip";
import { SpeakerButton } from "@/components/games/SpeakerButton";
import { Banner, Body, Card, Chip, Eyebrow, InfoPanel, PillButton, Screen, SegmentedProgress } from "@/components/ui";
import { MINIMAL_PAIRS, pairGroup } from "@/data/minimal-pairs";
import { EMPTY_TALLY, accuracy, buildSoundRounds, tallyAnswer, type SoundRound } from "@/games/quiz";
import { clockSeed, seededRng } from "@/games/random";
import { useGameProgress } from "@/games/store";
import { useExitGuard } from "@/hooks/useExitGuard";
import { useServerStatus } from "@/hooks/useServerStatus";
import { useWordAudio } from "@/hooks/useWordAudio";
import { haptics } from "@/lib/haptics";
import { colors, spacing } from "@/theme/theme";

const ROUND_LENGTH = 10;
const ALL = "all";

export default function SoundMatchScreen() {
  const params = useLocalSearchParams<{ group?: string }>();
  const { progress, recordRound } = useGameProgress();
  const audio = useWordAudio();
  const server = useServerStatus();

  const [groupKey, setGroupKey] = useState(() => (params.group && pairGroup(params.group) ? params.group : ALL));
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
  useEffect(() => {
    if (!round || finished) return;
    let cancelled = false;
    const roundId = round.id;
    audio.speak(round.target).then((ok) => {
      if (!cancelled && ok) setHeardFor(roundId);
    });
    const upcoming = rounds?.[index + 1];
    if (upcoming) audio.prefetch(upcoming.target);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, finished]);

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
      <Screen edges={["top", "left", "right", "bottom"]}>
        <GameTopBar eyebrow="Sound Match" title="Train your ear" onClose={() => router.back()} />

        {!server.reachable && !server.checking ? (
          <Banner
            tone="error"
            message={server.message ?? "Cadence can't reach the server, and this game needs it to read the words aloud."}
            actionLabel={server.actionLabel ?? "Try again"}
            onAction={server.refresh}
          />
        ) : null}

        <Card>
          <Eyebrow>Pick a contrast</Eyebrow>
          <Body size={13}>
            You&apos;ll hear one word and choose which of the pair it was. Start with the sounds your
            modules are working on.
          </Body>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All sounds" status={groupKey === ALL ? "correct" : "neutral"} selected={groupKey === ALL} onPress={() => setGroupKey(ALL)} />
            {MINIMAL_PAIRS.map((group) => (
              <Chip
                key={group.key}
                label={group.label}
                status={group.key === groupKey ? "correct" : "neutral"}
                selected={group.key === groupKey}
                onPress={() => {
                  haptics.select();
                  setGroupKey(group.key);
                }}
              />
            ))}
          </ScrollView>
          <InfoPanel>
            <Body size={13}>
              {chosen
                ? chosen.blurb
                : "A mix of every contrast: R and L, V and W, the two TH sounds, tricky vowels and more."}
            </Body>
            {chosen ? (
              <Body size={12} style={styles.muted}>
                {chosen.pairs.map((pair) => `${pair[0]} / ${pair[1]}`).join(" · ")}
              </Body>
            ) : null}
          </InfoPanel>
          <PillButton
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
      <Screen edges={["top", "left", "right", "bottom"]}>
        <GameTopBar eyebrow={eyebrow} title="Round over" onClose={() => router.back()} />
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
          playAgainLabel="Same contrast again"
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
    <Screen edges={["top", "left", "right", "bottom"]}>
      <GameTopBar
        eyebrow={eyebrow}
        title={`Round ${index + 1} of ${rounds.length}`}
        onClose={() => router.back()}
        trailing={<ScoreStrip score={tally.score} streak={tally.streak} />}
      />
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
        <Body size={13} style={styles.muted}>
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
            onPress={() => (answered ? audio.speak(word) : choose(word))}
          />
        ))}
      </View>

      {answered ? (
        <>
          <InfoPanel tone={correct ? "cream" : "white"}>
            <Eyebrow tone={correct ? undefined : colors.brick}>
              {correct ? "That's the one" : `It was “${round.target}”`}
            </Eyebrow>
            <Body size={13}>Tap either word to hear it. Compare them back to back.</Body>
          </InfoPanel>
          <PillButton
            label={index + 1 >= rounds.length ? "See results" : "Next"}
            icon={<ArrowRight color={colors.snow} size={16} />}
            onPress={next}
          />
        </>
      ) : (
        <Body size={12} style={[styles.muted, styles.footer]}>
          Not sure? Play it again before you choose — there&apos;s no penalty.
        </Body>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  muted: {
    color: colors.slate,
  },
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
});
