// Advanced practice: today's drill list (assigned by your assistant, reviews
// due, new phrases, plateau steps) and the way into the phrase bank, slang,
// the plateau track and your recordings. Everything here works offline from
// the bundled packs; signed in, it also picks up what your assistant
// assigned, and with Plus it syncs across devices.
import { router, useFocusEffect } from "expo-router";
import { AudioLines, BookText, MessageCircleMore, Mountain } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Button, Card, Eyebrow, LoadingBlock, Screen, Title, TopBar } from "@/components/ui";
import { useAccount } from "@/context/account";
import { useAdvancedContent } from "@/learning/advanced-content";
import { syncAdvanced, useAdvancedState } from "@/learning/advanced-store";
import { ItemRow, Tag } from "@/learning/advanced-ui";
import { useLearningGoals } from "@/learning/goals";
import { today } from "@/learning/store";
import { buildDailyPlan } from "@/platform/daily-plan";
import { dailyDrills, retestDue, trackSummary, PHASE_COPY } from "@/platform/fossilization";
import { buildPracticeDay } from "@/platform/practice-day";
import { colors, spacing, type, themed } from "@/theme/theme";

const REASON = { assigned: "Assigned", due: "Review", new: "New", plateau: "Plateau" } as const;

export default function AdvancedHub() {
  const content = useAdvancedContent();
  const { state, loaded } = useAdvancedState();
  const { tier } = useAccount();
  useFocusEffect(useCallback(() => void syncAdvanced(tier), [tier]));
  const day = today();
  const goals = useLearningGoals();

  const practice = useMemo(() => (content && loaded ? buildPracticeDay({ day, phrases: content.phrases, slang: content.slang, cards: state.cards, list: state.list, track: state.track, catalog: content.errors }) : null), [content, loaded, state, day]);
  const plan = useMemo(
    () =>
      content && loaded
        ? buildDailyPlan({
            today: day,
            dueCards: [],
            sounds: [],
            grammar: [],
            level: null,
            aiAvailable: false,
            plateau: state.track ? { steps: dailyDrills(state.track, content.errors, day).length, retestDue: retestDue(state.track, day) !== null } : null,
            dueItems: Object.entries(state.cards).map(([itemId, c]) => ({ itemId, due: c.due })),
            goals,
          })
        : null,
    [content, loaded, state, day, goals],
  );
  const summary = state.track ? trackSummary(state.track, day) : null;
  const phraseMinutes = plan?.items.find((i) => i.kind === "phrases")?.minutes ?? 0;

  return (
    <Screen>
      <TopBar eyebrow="Advanced practice" title="Phrases, slang and the plateau" onBack={() => router.back()} />
      {!content || !practice ? (
        <LoadingBlock rows={3} label="Opening advanced practice…" />
      ) : (
        <>
          <Card style={styles.today}>
            <Eyebrow>Today</Eyebrow>
            <Title size={type.title2}>{practice.items.length ? `${practice.items.length} items to say aloud` : "Nothing due"}</Title>
            <Body size={type.footnote} tone="muted">
              {[practice.counts.assigned && `${practice.counts.assigned} assigned`, practice.counts.due && `${practice.counts.due} to review`, practice.counts.new && `${practice.counts.new} new`, practice.counts.plateau && `${practice.counts.plateau} plateau steps`].filter(Boolean).join(" · ") || "Browse the phrase bank to start."}
              {phraseMinutes ? ` · about ${phraseMinutes} min in today's plan` : ""}
            </Body>
            <View style={styles.preview}>
              {practice.items.slice(0, 3).map((item) => (
                <View key={item.itemId} style={styles.previewRow}>
                  <Body size={type.callout} numberOfLines={2} style={styles.previewText}>
                    {item.say}
                  </Body>
                  <Tag label={REASON[item.reason]} tone={item.reason === "due" ? "green" : "grey"} />
                </View>
              ))}
            </View>
            <Button label="Start phrases" onPress={() => router.push("/advanced/phrases/practice")} />
          </Card>

          <View style={styles.section}>
            <Eyebrow>Practise</Eyebrow>
            <ItemRow title="Phrase bank" detail={`${content.phrases.length.toLocaleString()} chunks, collocations and sentence frames, B2 to C2, by situation.`} onPress={() => router.push("/advanced/phrases")} tags={<BookText color={colors.carbon} size={16} />} />
            <ItemRow title="Modern slang" detail={`${content.slang.length} current expressions: what they mean, where they fit, who says them.`} onPress={() => router.push("/advanced/slang")} tags={<MessageCircleMore color={colors.carbon} size={16} />} />
            <ItemRow
              title="Plateau track"
              detail={summary ? `Week ${Math.min(summary.week, summary.weeks)} of ${summary.weeks}: ${PHASE_COPY[summary.phase].title}.${summary.retestDue ? " Re-test due." : ""}` : "Twelve weeks on the errors that persist at C1 and C2. Starts with a short diagnostic."}
              onPress={() => router.push("/advanced/plateau")}
              tags={<Mountain color={colors.carbon} size={16} />}
            />
            <ItemRow title="Your recordings" detail="Every take you kept, by phrase or by date, next to the target." onPress={() => router.push("/advanced/recordings")} tags={<AudioLines color={colors.carbon} size={16} />} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    today: { gap: spacing.sm },
    preview: { gap: spacing.sm, marginVertical: spacing.sm },
    previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    previewText: { flex: 1 },
    section: { gap: spacing.sm },
  }),
);
