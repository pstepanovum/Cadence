import { router, useLocalSearchParams } from "expo-router";
import { Eye, Shuffle, Undo2, Volume2 } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { logPractice, useSessionClock } from "@/learning/log";
import { LetterTile, type TileState } from "@/components/games/LetterTile";
import { RoundSummary } from "@/components/games/RoundSummary";
import { ScoreStrip } from "@/components/games/ScoreStrip";
import { Body, Button, Card, Eyebrow, Screen, SegmentedProgress, TopBar } from "@/components/ui";
import { levelLabel, parseLevel, vocabForLevel, type VocabWord } from "@/data/vocabulary";
import { EMPTY_TALLY, accuracy, tallyAnswer } from "@/games/quiz";
import { clockSeed, sample, seededRng } from "@/games/random";
import { useGameProgress } from "@/games/store";
import { isScrambleable, scrambleWord, type ScrambleTile } from "@/games/text";
import { useExitGuard } from "@/hooks/useExitGuard";
import { useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { colors, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

const ROUND_LENGTH = 8;
const FLASH_MS = 650;
const PARTIAL_POINTS = 5;
const TILE_GAP = spacing.xs + 2;
const MAX_TILE = 52;

type Phase = "building" | "correct" | "wrong" | "revealed";

function pickWords(level: ReturnType<typeof parseLevel>): VocabWord[] {
  const pool = vocabForLevel(level).filter((word) => isScrambleable(word.word));
  return sample(pool, ROUND_LENGTH, seededRng(clockSeed()));
}

/**
 * The largest tile that fits the word on one row, but never under the 44pt
 * tap target. The gap tightens before a row wraps, so an eight-letter word
 * stays on one line on a large phone; on a small one it wraps instead.
 */
function tileLayoutFor(letters: number, rowWidth: number): { size: number; gap: number } {
  const count = Math.max(letters, 1);
  const gap = count * TAP_TARGET + (count - 1) * TILE_GAP > rowWidth ? spacing.xs : TILE_GAP;
  const fit = Math.floor((rowWidth - gap * (count - 1)) / count);
  return { size: Math.max(TAP_TARGET, Math.min(MAX_TILE, fit)), gap };
}

export default function ScrambleScreen() {
  const elapsed = useSessionClock();
  const params = useLocalSearchParams<{ level?: string }>();
  const level = parseLevel(params.level);
  const { progress, recordRound } = useGameProgress();
  const audio = useSpeech();
  const { prefetch } = audio;
  const { width } = useWindowDimensions();

  const [words, setWords] = useState(() => pickWords(level));
  const [index, setIndex] = useState(0);
  const [tiles, setTiles] = useState<ScrambleTile[]>(() => (words[0] ? scrambleWord(words[0].word) : []));
  const [placed, setPlaced] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("building");
  const [mistakes, setMistakes] = useState(0);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [outcomes, setOutcomes] = useState<Record<string, "clean" | "messy" | "revealed">>({});
  const [finished, setFinished] = useState(false);
  const [previousBest, setPreviousBest] = useState(() => progress.bests.scramble ?? 0);
  const recorded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const word = words[index];
  const target = word?.word.toLowerCase() ?? "";
  const answer = placed.map((id) => tiles[id]?.letter ?? "").join("");
  // Screen gutters and the board's padding.
  const rowWidth = Math.min(width, 640) - spacing.lg * 2 - spacing.md * 2;
  const { size: tileSize, gap: tileGap } = tileLayoutFor(target.length, rowWidth);

  useExitGuard(
    tally.answered > 0 && !finished,
    "Leave the scramble?",
    "This round's score will be lost. Finished rounds are saved automatically.",
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const wordText = word?.word;
  useEffect(() => {
    if (wordText) prefetch(wordText);
  }, [wordText, prefetch]);

  const percent = useMemo(() => accuracy(tally.correct, tally.answered), [tally]);

  function loadWord(nextIndex: number, list = words) {
    setIndex(nextIndex);
    setTiles(list[nextIndex] ? scrambleWord(list[nextIndex].word) : []);
    setPlaced([]);
    setPhase("building");
    setMistakes(0);
  }

  function advance(outcome: "clean" | "messy" | "revealed") {
    if (!word) return;
    const nextOutcomes = { ...outcomes, [word.id]: outcome };
    setOutcomes(nextOutcomes);
    audio.stop();
    if (index + 1 >= words.length) {
      finish(nextOutcomes);
    } else {
      loadWord(index + 1);
    }
  }

  function placeTile(id: number) {
    if (phase !== "building" || placed.includes(id)) return;
    haptics.select();
    const nextPlaced = [...placed, id];
    setPlaced(nextPlaced);
    if (nextPlaced.length === tiles.length) check(nextPlaced);
  }

  function removeTile(id: number) {
    if (phase !== "building") return;
    haptics.select();
    setPlaced((current) => current.filter((item) => item !== id));
  }

  function check(nextPlaced: number[]) {
    const built = nextPlaced.map((id) => tiles[id].letter).join("");
    if (built === target) {
      setPhase("correct");
      haptics.success();
      playAssessmentFeedback(100);
      const clean = mistakes === 0;
      setTally((current) => {
        const next = tallyAnswer(current, true);
        return clean ? next : { ...next, score: current.score + PARTIAL_POINTS };
      });
      timer.current = setTimeout(() => advance(clean ? "clean" : "messy"), FLASH_MS);
    } else {
      setPhase("wrong");
      haptics.error();
      setMistakes((value) => value + 1);
      timer.current = setTimeout(() => {
        setPlaced([]);
        setPhase("building");
      }, FLASH_MS);
    }
  }

  function reshuffle() {
    if (phase !== "building") return;
    // Keep what has been placed; reshuffle only the pool so nothing is lost.
    const pool = tiles.filter((tile) => !placed.includes(tile.id));
    const shuffled = scrambleWord(pool.map((tile) => tile.letter).join(""));
    const placedTiles = placed.map((id) => tiles[id]);
    const next = [...placedTiles, ...shuffled.map((tile) => ({ ...tile }))].map((tile, id) => ({
      id,
      letter: tile.letter,
    }));
    setTiles(next);
    setPlaced(placedTiles.map((_, id) => id));
  }

  function reveal() {
    if (phase !== "building" || !word) return;
    haptics.warning();
    playAssessmentFeedback(0);
    setPhase("revealed");
    // Lay the word out in order so the learner sees it before moving on.
    const ordered = Array.from(target).map((letter, id) => ({ id, letter }));
    setTiles(ordered);
    setPlaced(ordered.map((tile) => tile.id));
    setTally((current) => tallyAnswer(current, false));
    timer.current = setTimeout(() => advance("revealed"), FLASH_MS * 2);
  }

  function finish(finalOutcomes: Record<string, "clean" | "messy" | "revealed">) {
    setFinished(true);
    if (recorded.current) return;
    recorded.current = true;
    const total = Object.keys(finalOutcomes).length;
    const correct = Object.values(finalOutcomes).filter((value) => value !== "revealed").length;
    const finalPercent = accuracy(correct, total);
    logPractice({ kind: "matching", refId: "game.scramble", level: null, score: finalPercent, minutes: elapsed() });
    if (finalPercent >= 70) playCompletionSound();
    recordRound({
      gameId: "scramble",
      score: tally.score,
      accuracy: finalPercent,
      correct,
      total,
      label: levelLabel(level),
    });
  }

  function playAgain() {
    recorded.current = false;
    setPreviousBest((best) => Math.max(best, tally.score));
    const next = pickWords(level);
    setWords(next);
    setTally(EMPTY_TALLY);
    setOutcomes({});
    setFinished(false);
    loadWord(0, next);
  }

  const eyebrow = `Word Scramble · ${levelLabel(level)}`;

  if (finished || !word) {
    const played = words.filter((item) => item.id in outcomes);
    return (
      <Screen>
        <TopBar closeLabel="Leave this game" eyebrow={eyebrow} title="Round over" onClose={() => router.back()} />
        <RoundSummary
          accuracy={percent}
          isNewBest={tally.score > previousBest && tally.score > 0}
          subtitle="A word solved first time earns full points. Solved after a miss earns a few."
          stats={[
            { label: "Score", value: String(tally.score) },
            { label: "Solved", value: `${tally.correct}/${tally.answered}` },
            { label: "Best combo", value: `×${tally.bestStreak}` },
          ]}
          items={played.map((item) => ({
            label: item.word,
            status:
              outcomes[item.id] === "clean" ? "correct" : outcomes[item.id] === "messy" ? "mixed" : "needs-work",
          }))}
          onPlayAgain={playAgain}
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  function slotState(position: number): TileState {
    if (phase === "correct") return "correct";
    if (phase === "wrong") return "wrong";
    if (phase === "revealed") return "placed";
    return placed[position] !== undefined ? "placed" : "empty";
  }

  return (
    <Screen>
      <TopBar closeLabel="Leave this game"
        eyebrow={eyebrow}
        title={`Word ${index + 1} of ${words.length}`}
        onClose={() => router.back()}
      />
      <ScoreStrip score={tally.score} streak={tally.streak} />
      <SegmentedProgress total={words.length} currentIndex={index} />

      <Card variant="cream" style={styles.clue}>
        <Eyebrow>{word.pos} · your clue</Eyebrow>
        <Body size={type.headline} weight="semibold" style={styles.center}>
          {word.definition}
        </Body>
        {mistakes > 0 && phase === "building" ? (
          <Body size={type.caption} tone="error">
            Not that order. The first letter is “{target[0].toUpperCase()}”.
          </Body>
        ) : null}
      </Card>

      <Card style={styles.board}>
        <Eyebrow>{phase === "revealed" ? "The word was" : "Your answer"}</Eyebrow>
        <View style={[styles.row, { gap: tileGap }]} accessibilityLabel={answer ? `So far: ${answer}` : "Nothing placed yet"}>
          {Array.from(target).map((_, position) => {
            const tileId = placed[position];
            const tile = tileId !== undefined ? tiles[tileId] : undefined;
            return (
              <LetterTile
                key={position}
                letter={tile?.letter ?? ""}
                size={tileSize}
                state={slotState(position)}
                onPress={tile && phase === "building" ? () => removeTile(tile.id) : undefined}
              />
            );
          })}
        </View>

        <Eyebrow>Letters</Eyebrow>
        <View style={[styles.row, { gap: tileGap }]}>
          {tiles.map((tile) => (
            <LetterTile
              key={tile.id}
              letter={tile.letter}
              size={tileSize}
              state={placed.includes(tile.id) ? "ghost" : "pool"}
              onPress={() => placeTile(tile.id)}
            />
          ))}
        </View>
      </Card>

      <View style={styles.tools}>
        <Button
          label="Undo"
          variant="tonal"
          icon={<Undo2 color={colors.hunter} size={16} />}
          disabled={placed.length === 0 || phase !== "building"}
          onPress={() => removeTile(placed[placed.length - 1])}
          style={styles.tool}
        />
        <Button
          label="Shuffle"
          variant="tonal"
          icon={<Shuffle color={colors.hunter} size={16} />}
          disabled={phase !== "building"}
          onPress={reshuffle}
          style={styles.tool}
        />
        <Button
          label="Hear it"
          variant="tonal"
          icon={<Volume2 color={colors.hunter} size={16} />}
          loading={audio.isLoading}
          onPress={() => audio.toggle(word.word)}
          style={styles.tool}
        />
      </View>
      <Button
        label="Give up and reveal"
        variant="outline"
        icon={<Eye color={colors.hunter} size={16} />}
        disabled={phase !== "building"}
        onPress={reveal}
      />
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    clue: {
      alignItems: "center",
      gap: spacing.sm,
    },
    center: {
      textAlign: "center",
    },
    board: {
      gap: spacing.md,
      paddingHorizontal: spacing.md,
    },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
    },
    tools: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    tool: {
      flexGrow: 1,
      paddingHorizontal: spacing.sm,
    },
  }),
);
