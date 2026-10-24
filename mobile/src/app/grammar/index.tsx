// The grammar reference for a level, grouped by topic, with search.
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Body, Chip, EmptyState, Eyebrow, HorizontalPicker, LoadingBlock, pressedCard, Screen, TextField, Title, TopBar } from "@/components/ui";
import { grammarByTopic, searchGrammar } from "@/content/catalog";
import { parseLevelParam, useLevelPack } from "@/content/useContent";
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { useLearning } from "@/learning/store";
import { CEFR_LEVELS, type CefrLevel, type GrammarPoint } from "@/platform/content-model";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

export default function GrammarIndex() {
  const params = useLocalSearchParams<{ level?: string }>();
  const [level, setLevel] = useState<CefrLevel>(parseLevelParam(params.level));
  const [query, setQuery] = useState("");
  const pack = useLevelPack(level);
  const { state } = useLearning();

  const groups = useMemo(() => {
    if (!pack.content) return [];
    if (!query.trim()) return grammarByTopic(pack.content);
    const hits = searchGrammar(pack.content.grammarPoints, query);
    return hits.length ? [{ topicId: "search", title: `${hits.length} ${hits.length === 1 ? "match" : "matches"}`, points: hits }] : [];
  }, [pack.content, query]);

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Grammar" title="Grammar reference" />
      <HorizontalPicker selectedIndex={CEFR_LEVELS.indexOf(level)}>
        {CEFR_LEVELS.map((item) => (
          <Chip key={item} label={item} selected={item === level} onPress={() => setLevel(item)} />
        ))}
      </HorizontalPicker>
      <TextField placeholder="Search, e.g. since or a/an" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search grammar" />

      {pack.isLoading ? (
        <LoadingBlock rows={3} />
      ) : !pack.content ? (
        <EmptyState title={`${level} isn't on this phone yet`} message="Download it from Offline content packs." illustration={ILLUSTRATION_PROGRESS} actionLabel="Get content packs" onAction={() => router.push("/settings/packs")} />
      ) : groups.length === 0 ? (
        <EmptyState compact title={query ? "No matches" : "No grammar at this level yet"} message={query ? "Try a shorter word, or another level." : "Pick another level."} />
      ) : (
        groups.map((group) => (
          <View key={group.topicId} style={styles.group}>
            <Eyebrow>{group.title}</Eyebrow>
            {group.points.map((point) => (
              <PointRow key={point.id} point={point} level={level} accuracy={state.grammar[point.id]} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

function PointRow({ point, level, accuracy }: { point: GrammarPoint; level: CefrLevel; accuracy?: { attempts: number; correct: number } }) {
  const percent = accuracy && accuracy.attempts ? Math.round((accuracy.correct / accuracy.attempts) * 100) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${point.title}. ${point.summary}${percent !== null ? ` You get ${percent} percent right.` : ""}`}
      onPress={() => router.push({ pathname: "/grammar/[pointId]", params: { pointId: point.id, level } })}
      style={({ pressed }) => [styles.row, pressedCard(pressed)]}>
      <View style={styles.text}>
        <Title size={type.headline}>{point.title}</Title>
        <Body size={type.footnote} tone="muted" numberOfLines={2}>
          {point.summary}
        </Body>
      </View>
      {percent !== null ? <Chip label={`${percent}%`} status={percent >= 80 ? "correct" : percent >= 50 ? "mixed" : "needs-work"} /> : null}
      <ChevronRight color={colors.slate} size={20} />
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    group: { gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.snow, padding: spacing.lg, boxShadow: shadows.card },
    text: { flex: 1, gap: spacing.xxs },
  }),
);
