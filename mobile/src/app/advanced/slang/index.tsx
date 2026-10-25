// Modern slang: the dictionary by where it fits and region, searchable,
// with dated entries marked, and the way into today's quiz.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Button, Chip, EmptyState, HorizontalPicker, LoadingBlock, ScreenList, TextField, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { useAdvancedState } from "@/learning/advanced-store";
import { ItemRow, Tag } from "@/learning/advanced-ui";
import { searchSlang, SLANG_FIT_LABELS, SLANG_FITS, type SlangFit, type SlangRegion } from "@/platform/phrase-bank";
import { isDue } from "@/platform/srs";
import { spacing, type, themed } from "@/theme/theme";

const REGIONS: { value: SlangRegion | null; label: string }[] = [
  { value: null, label: "Every region" },
  { value: "US", label: "American" },
  { value: "UK", label: "British" },
];

export default function SlangScreen() {
  const content = useAdvancedContent();
  const { state } = useAdvancedState();
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState<SlangFit | null>(null);
  const [region, setRegion] = useState<SlangRegion | null>(null);
  const results = useMemo(() => (content ? searchSlang(content.slang, { query, fit: fit ?? undefined, region: region ?? undefined, limit: 10_000 }) : []), [content, query, fit, region]);
  const now = new Date();
  const due = content?.slang.filter((e) => isDue(state.cards[e.id], now)).length ?? 0;

  const header = (
    <View style={styles.header}>
      <TopBar eyebrow="Modern slang" title="The English nobody taught you" onBack={() => router.back()} />
      <TextField value={query} onChangeText={setQuery} placeholder="Search a word or a meaning" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search slang" />
      <HorizontalPicker selectedIndex={fit ? SLANG_FITS.indexOf(fit) + 1 : 0}>
        {[<Chip key="any" label="Anywhere" selected={fit === null} onPress={() => setFit(null)} />, ...SLANG_FITS.map((f) => <Chip key={f} label={SLANG_FIT_LABELS[f]} selected={fit === f} onPress={() => setFit(f)} />)]}
      </HorizontalPicker>
      <HorizontalPicker selectedIndex={REGIONS.findIndex((r) => r.value === region)}>
        {REGIONS.map((r) => (
          <Chip key={r.label} label={r.label} selected={region === r.value} onPress={() => setRegion(r.value)} />
        ))}
      </HorizontalPicker>
      <View style={styles.bar}>
        <Body size={type.footnote} tone="muted">
          {content ? `${results.length} entries` : ""}
        </Body>
        <Button label={due ? `Quiz · ${due} due` : "Today's quiz"} variant="tonal" onPress={() => router.push("/advanced/slang/quiz")} style={styles.quiz} />
      </View>
    </View>
  );

  return (
    <ScreenList
      data={content ? results : []}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListEmptyComponent={!content ? <LoadingBlock rows={4} label="Opening slang…" /> : <EmptyState compact title="Nothing matches" message="Try another word or clear a filter." />}
      renderItem={({ item }) => (
        <ItemRow
          title={item.term}
          detail={item.meaning}
          onPress={() => router.push({ pathname: "/advanced/slang/[id]", params: { id: item.id } })}
          tags={
            <>
              {item.dated ? <Tag label="Dated" tone="muted" /> : null}
              {item.fits.includes("avoid-at-work") ? <Tag label="Not at work" /> : null}
              {isDue(state.cards[item.id], now) ? <Tag label="Due" tone="green" /> : null}
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
    quiz: { minHeight: 40 },
  }),
);
