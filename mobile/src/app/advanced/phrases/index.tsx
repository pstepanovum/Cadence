// The phrase bank: B2 to C2 chunks, collocations and sentence frames,
// filtered by level and situation and searchable, from the bundled packs.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Button, Chip, EmptyState, HorizontalPicker, LoadingBlock, ScreenList, TextField, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { useAdvancedState } from "@/learning/advanced-store";
import { ItemRow, Tag } from "@/learning/advanced-ui";
import type { CefrLevel } from "@/platform/content-model";
import { PHRASE_LEVELS, PHRASE_SITUATIONS, searchPhrases } from "@/platform/phrase-bank";
import { isDue, isNew } from "@/platform/srs";
import { spacing, type, themed } from "@/theme/theme";

export default function PhraseBankScreen() {
  const content = useAdvancedContent();
  const { state } = useAdvancedState();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [situation, setSituation] = useState<string | null>(null);
  const results = useMemo(() => (content ? searchPhrases(content.phrases, { query, level: level ?? undefined, situation: situation ?? undefined, limit: 100_000 }) : []), [content, query, level, situation]);
  const now = new Date();
  const levels = [...PHRASE_LEVELS].reverse();

  const header = (
    <View style={styles.header}>
      <TopBar eyebrow="Phrase bank" title="Learn phrases, not words" onBack={() => router.back()} />
      <TextField value={query} onChangeText={setQuery} placeholder="Search: push back, to be fair…" autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search phrases" />
      <HorizontalPicker selectedIndex={level ? levels.indexOf(level as (typeof levels)[number]) + 1 : 0}>
        {[<Chip key="all" label="All levels" selected={level === null} onPress={() => setLevel(null)} />, ...levels.map((l) => <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(l)} />)]}
      </HorizontalPicker>
      <HorizontalPicker selectedIndex={situation ? PHRASE_SITUATIONS.findIndex((s) => s.id === situation) + 1 : 0}>
        {[<Chip key="all" label="Every situation" selected={situation === null} onPress={() => setSituation(null)} />, ...PHRASE_SITUATIONS.map((s) => <Chip key={s.id} label={s.title} selected={situation === s.id} onPress={() => setSituation(s.id)} />)]}
      </HorizontalPicker>
      <View style={styles.bar}>
        <Body size={type.footnote} tone="muted">
          {content ? `${results.length.toLocaleString()} phrases` : ""}
        </Body>
        <Button label="Practise today's" variant="tonal" onPress={() => router.push("/advanced/phrases/practice")} style={styles.practise} />
      </View>
    </View>
  );

  return (
    <ScreenList
      data={content ? results : []}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListEmptyComponent={
        !content ? <LoadingBlock rows={4} label="Opening the phrase bank…" /> : <EmptyState compact title={content.phrases.length ? "Nothing matches" : "The phrase bank isn't in this version"} message={content.phrases.length ? "Try fewer words, or clear a filter." : "It arrives with a content update."} />
      }
      initialNumToRender={14}
      renderItem={({ item }) => (
        <ItemRow
          title={item.text}
          detail={item.meaning}
          onPress={() => router.push({ pathname: "/advanced/phrases/[id]", params: { id: item.id } })}
          tags={
            <>
              <Tag label={item.level} />
              {isDue(state.cards[item.id], now) ? <Tag label="Due" tone="green" /> : !isNew(state.cards[item.id]) ? <Tag label="Started" tone="muted" /> : null}
            </>
          }
        />
      )}
    />
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: { gap: spacing.md, marginBottom: spacing.md },
    bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    practise: { minHeight: 40 },
  }),
);
