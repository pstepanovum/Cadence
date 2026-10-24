import { Link } from "expo-router";
import {
  Brain,
  ChevronRight,
  Ear,
  Flame,
  Keyboard,
  Layers,
  Puzzle,
  Trophy,
  WifiOff,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  Body,
  Card,
  Chip,
  Eyebrow,
  InfoPanel,
  ProgressBar,
  Screen,
  SectionHeader,
  StatTile,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { VOCABULARY, VOCAB_LEVELS, levelLabel, suggestedLevel, vocabForLevel, type VocabLevel } from "@/data/vocabulary";
import { GAMES, gameInfo, type GameInfo } from "@/games/catalog";
import { playStreak, type GameId, type GameResult } from "@/games/progress";
import { summarizeDeck } from "@/games/srs";
import { useGameProgress } from "@/games/store";
import { useServerStatus } from "@/hooks/useServerStatus";
import { haptics } from "@/lib/haptics";
import { colors, overlays, radii, spacing } from "@/theme/theme";

const ICONS: Record<GameId, React.ComponentType<{ color: string; size: number }>> = {
  flashcards: Layers,
  "meaning-match": Brain,
  spelling: Keyboard,
  scramble: Puzzle,
  "sound-match": Ear,
};

const ROUTES = {
  flashcards: "/game/flashcards",
  "meaning-match": "/game/meaning-match",
  spelling: "/game/spelling",
  scramble: "/game/scramble",
  "sound-match": "/game/sound-match",
} as const satisfies Record<GameId, string>;

export default function PlayScreen() {
  const { profile } = useAuth();
  const { progress, loaded } = useGameProgress();
  const server = useServerStatus();

  const [level, setLevel] = useState<VocabLevel>(() => suggestedLevel(profile.practiceFocus));

  const now = useMemo(() => new Date(), [progress]); // eslint-disable-line react-hooks/exhaustive-deps
  const allIds = useMemo(() => VOCABULARY.map((word) => word.id), []);
  const overall = useMemo(() => summarizeDeck(allIds, progress.cards, now), [allIds, progress.cards, now]);
  const deck = useMemo(() => {
    const ids = vocabForLevel(level).map((word) => word.id);
    return summarizeDeck(ids, progress.cards, now);
  }, [level, progress.cards, now]);

  const known = overall.known + overall.mastered;
  const streak = playStreak(progress.days, now);
  const recent = progress.results.slice(0, 5);

  return (
    <Screen>
      <SectionHeader
        eyebrow="Play"
        title="Word games"
        subtitle="Short rounds for new words, spelling and your ear. Progress is kept on this phone."
      />

      <Card variant="dark">
        <Eyebrow onDark>Your words</Eyebrow>
        <Title size={22} onDark>
          {!loaded
            ? "Loading your progress…"
            : known === 0
              ? "Start your first deck"
              : `${known} ${known === 1 ? "word" : "words"} you know`}
        </Title>
        <View style={styles.statsRow}>
          <StatTile tone="translucent" label="Known" value={loaded ? `${known}/${overall.total}` : "—"} />
          <StatTile tone="translucent" label="Due today" value={loaded ? String(overall.dueToday) : "—"} />
          <StatTile tone="translucent" label="Play streak" value={loaded ? `${streak}d` : "—"} />
        </View>
        <ProgressBar value={overall.total ? (known / overall.total) * 100 : 0} onDark />
        <View style={styles.streakRow}>
          <Flame color={streak > 0 ? colors.yellowGreen : colors.cream} size={18} />
          <Body size={12} onDark style={styles.streakText}>
            {streak > 0
              ? `${streak}-day play streak. One round today keeps it going.`
              : "Finish any round today to start a play streak."}
          </Body>
        </View>
      </Card>

      <Card>
        <Eyebrow>Deck</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {VOCAB_LEVELS.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              status={item.key === level ? "correct" : "neutral"}
              selected={item.key === level}
              onPress={() => {
                haptics.select();
                setLevel(item.key);
              }}
            />
          ))}
        </ScrollView>
        <Body size={13}>{VOCAB_LEVELS.find((item) => item.key === level)?.blurb}</Body>
        <InfoPanel>
          <View style={styles.deckRow}>
            <DeckStat label="New" value={deck.new} />
            <DeckStat label="Learning" value={deck.learning} />
            <DeckStat label="Known" value={deck.known + deck.mastered} />
            <DeckStat label="Due" value={deck.dueToday} accent />
          </View>
        </InfoPanel>
      </Card>

      <View style={styles.list}>
        {GAMES.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            level={level}
            best={progress.bests[game.id]}
            dueToday={game.id === "flashcards" ? deck.dueToday : undefined}
            offline={game.needsServer && !server.reachable && !server.checking}
          />
        ))}
      </View>

      {recent.length > 0 ? (
        <Card>
          <View style={styles.recentHead}>
            <Trophy color={colors.sage} size={18} />
            <Eyebrow>Recent rounds</Eyebrow>
          </View>
          {recent.map((result, index) => (
            <RecentRow key={`${result.playedAt}-${index}`} result={result} now={now} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function DeckStat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={styles.deckStat}>
      <Body size={18} weight="bold" style={{ color: accent && value > 0 ? colors.brick : colors.hunter }}>
        {value}
      </Body>
      <Body size={11} style={{ color: colors.slate }}>
        {label}
      </Body>
    </View>
  );
}

function GameCard({
  game,
  level,
  best,
  dueToday,
  offline,
}: {
  game: GameInfo;
  level: VocabLevel;
  best: number | undefined;
  dueToday?: number;
  offline: boolean;
}) {
  const Icon = ICONS[game.id];
  const usesDeck = game.id !== "sound-match";

  const card = (
    <Card style={offline ? styles.offlineCard : undefined}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Icon color={colors.hunter} size={22} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Eyebrow>{game.tagline}</Eyebrow>
          <Title size={19}>{game.title}</Title>
        </View>
        <ChevronRight color={offline ? colors.paleSlate : colors.slate} size={20} />
      </View>
      <Body size={13}>{game.blurb}</Body>
      <View style={styles.cardFoot}>
        {offline ? (
          <View style={styles.offlineTag}>
            <WifiOff color={colors.brick} size={14} />
            <Body size={12} weight="semibold" style={{ color: colors.brick }}>
              Needs your computer
            </Body>
          </View>
        ) : (
          <>
            {dueToday !== undefined && dueToday > 0 ? (
              <Chip label={`${dueToday} due`} status="mixed" />
            ) : null}
            <Chip label={best !== undefined ? `Best ${best}` : "Not played yet"} status={best !== undefined ? "correct" : "neutral"} />
            <Chip label={`~${game.minutes} min`} status="neutral" />
            {usesDeck ? <Chip label={levelLabel(level)} status="neutral" /> : null}
          </>
        )}
      </View>
    </Card>
  );

  if (offline) return card;

  return (
    <Link href={{ pathname: ROUTES[game.id], params: usesDeck ? { level } : {} }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${game.title}`}
        onPressIn={() => haptics.tap()}
        style={({ pressed }) => [pressed && styles.pressed]}>
        {card}
      </Pressable>
    </Link>
  );
}

function RecentRow({ result, now }: { result: GameResult; now: Date }) {
  const info = gameInfo(result.gameId);
  const Icon = ICONS[result.gameId];
  return (
    <View style={styles.recentRow}>
      <View style={styles.recentIcon}>
        <Icon color={colors.hunter} size={16} />
      </View>
      <View style={styles.recentBody}>
        <Body size={13} weight="semibold" style={{ color: colors.hunter }}>
          {info.title}
          {result.label ? ` · ${result.label}` : ""}
        </Body>
        <Body size={12} style={{ color: colors.slate }}>
          {result.correct}/{result.total} right · {timeAgo(result.playedAt, now)}
        </Body>
      </View>
      <Body size={15} weight="bold" style={{ color: colors.hunter }}>
        {result.score}
      </Body>
    </View>
  );
}

function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  streakText: {
    flex: 1,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deckRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  deckStat: {
    alignItems: "center",
  },
  list: {
    gap: spacing.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleWrap: {
    flex: 1,
    gap: 2,
  },
  cardFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  offlineCard: {
    backgroundColor: overlays.locked,
  },
  offlineTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  recentHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  recentBody: {
    flex: 1,
  },
});
