import { Link, useFocusEffect } from "expo-router";
import { Brain, ChevronRight, Ear, Flame, Keyboard, Layers, Puzzle, WifiOff } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  Body,
  Card,
  Chip,
  Eyebrow,
  HorizontalPicker,
  InfoPanel,
  pressedCard,
  ProgressBar,
  Screen,
  SectionHeader,
  StatRow,
  StatTile,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import {
  VOCABULARY,
  VOCAB_LEVELS,
  levelLabel,
  suggestedLevel,
  vocabForLevel,
  type VocabLevel,
} from "@/data/vocabulary";
import { GAMES, gameInfo, type GameInfo } from "@/games/catalog";
import { playStreak, type GameId, type GameResult } from "@/games/progress";
import { summarizeDeck } from "@/games/srs";
import { useGameProgress } from "@/games/store";
import { useRefresh } from "@/hooks/useRefresh";
import { useServerStatus } from "@/hooks/useServerStatus";
import { colors, radii, spacing, type } from "@/theme/theme";

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

  // "Due today" and "2 h ago" are measured from when the tab was last shown,
  // which is also when a finished round has just been saved.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  const { refreshing, onRefresh } = useRefresh(() => {
    setNow(new Date());
    server.refresh();
  });

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
    <Screen tab refreshing={refreshing} onRefresh={onRefresh}>
      <SectionHeader
        eyebrow="Play"
        title="Word games"
        subtitle="Short rounds for new words, spelling and your ear."
      />

      <Card>
        <View style={styles.heroHead}>
          <View style={styles.heroText}>
            <Eyebrow>Your words</Eyebrow>
            <Title size={type.title3}>
              {!loaded
                ? "Loading your progress…"
                : known === 0
                  ? "Start your first deck"
                  : `${known} ${known === 1 ? "word" : "words"} you know`}
            </Title>
          </View>
          <View
            style={[styles.streakBadge, streak > 0 && styles.streakBadgeOn]}
            accessible
            accessibilityLabel={`${streak}-day play streak`}>
            <Flame color={streak > 0 ? colors.ink : colors.slate} size={16} />
            <Body size={type.footnote} weight="bold" style={{ color: streak > 0 ? colors.ink : colors.slate }}>
              {streak}d
            </Body>
          </View>
        </View>
        <ProgressBar value={overall.total ? (known / overall.total) * 100 : 0} />
        <StatRow>
          <StatTile label="Known" value={loaded ? `${known}/${overall.total}` : "—"} />
          <StatTile label="Due today" value={loaded ? String(overall.dueToday) : "—"} />
        </StatRow>
      </Card>

      <View style={styles.section}>
        <Eyebrow>Deck</Eyebrow>
        <HorizontalPicker selectedIndex={Math.max(0, VOCAB_LEVELS.findIndex((item) => item.key === level))}>
          {VOCAB_LEVELS.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={item.key === level}
              onPress={() => setLevel(item.key)}
            />
          ))}
        </HorizontalPicker>
        <InfoPanel tone="white">
          <Body size={type.footnote} tone="muted">
            {VOCAB_LEVELS.find((item) => item.key === level)?.blurb}
          </Body>
          <View style={styles.deckRow}>
            <DeckStat label="New" value={deck.new} />
            <DeckStat label="Learning" value={deck.learning} />
            <DeckStat label="Known" value={deck.known + deck.mastered} />
            <DeckStat label="Due" value={deck.dueToday} accent />
          </View>
        </InfoPanel>
      </View>

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
          <Eyebrow>Recent rounds</Eyebrow>
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
    <View style={styles.deckStat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Body
        size={type.headline}
        weight="bold"
        maxFontSizeMultiplier={1.4}
        style={{ color: accent && value > 0 ? colors.brickText : colors.hunter }}>
        {value}
      </Body>
      <Body size={type.caption} tone="muted" maxFontSizeMultiplier={1.4}>
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
          <Title size={type.headline}>{game.title}</Title>
        </View>
        <ChevronRight color={offline ? colors.paleSlate : colors.slate} size={20} />
      </View>
      <Body size={type.callout}>{game.blurb}</Body>
      <View style={styles.cardFoot}>
        {offline ? (
          <View style={styles.offlineTag}>
            <WifiOff color={colors.brickText} size={14} />
            <Body size={type.footnote} weight="semibold" tone="error">
              Needs the server to read words aloud
            </Body>
          </View>
        ) : (
          <>
            {dueToday !== undefined && dueToday > 0 ? (
              <Chip label={`${dueToday} due`} status="mixed" />
            ) : null}
            <Chip
              label={best !== undefined ? `Best ${best}` : "Not played yet"}
              status={best !== undefined ? "correct" : "neutral"}
            />
            <Chip label={`~${game.minutes} min`} />
            {usesDeck ? <Chip label={levelLabel(level)} /> : null}
          </>
        )}
      </View>
    </Card>
  );

  if (offline) {
    return (
      <View accessible accessibilityLabel={`${game.title}. Needs the server to read words aloud.`}>
        {card}
      </View>
    );
  }

  return (
    <Link href={{ pathname: ROUTES[game.id], params: usesDeck ? { level } : {} }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${game.title}`}
        style={({ pressed }) => pressedCard(pressed)}>
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
        <Body size={type.footnote} weight="semibold" tone="strong">
          {info.title}
          {result.label ? ` · ${result.label}` : ""}
        </Body>
        <Body size={type.caption} tone="muted">
          {result.correct}/{result.total} right · {timeAgo(result.playedAt, now)}
        </Body>
      </View>
      <Body size={type.body} weight="bold" tone="strong">
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
  heroHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: spacing.xxs,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.platinum,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  streakBadgeOn: {
    backgroundColor: colors.yellowGreen,
  },
  section: {
    gap: spacing.sm,
  },
  deckRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.xs,
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
    borderRadius: radii.panel,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  cardFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  offlineCard: {
    opacity: 0.7,
    boxShadow: undefined,
  },
  offlineTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
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
