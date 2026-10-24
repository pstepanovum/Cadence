import { router, useFocusEffect } from "expo-router";
import { ChevronRight, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import type { CoachMode } from "@/api/types";
import { ReadinessBanner, ServerBanner } from "@/components/status";
import {
  Body,
  Button,
  Card,
  Chip,
  EmptyState,
  Eyebrow,
  LoadingBlock,
  OptionRow,
  pressedCard,
  RoundIconButton,
  ScreenList,
  SectionHeader,
  TextField,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { ILLUSTRATION_COMMUNICATION } from "@/data/svg";
import { useCoachReadiness } from "@/hooks/useEngineReadiness";
import { useRefresh } from "@/hooks/useRefresh";
import { useServerStatus } from "@/hooks/useServerStatus";
import { deleteCoachSession, readCoachSessions, type SavedCoachSession } from "@/lib/coach-storage";
import { haptics } from "@/lib/haptics";
import { averageScore } from "@/practice/scoring";
import { colors, spacing, type, themed } from "@/theme/theme";

const SUGGESTED_TOPICS = [
  "Describing my role at work",
  "Ordering at a restaurant",
  "A job interview",
  "Explaining a weekend trip",
];

const MODE_OPTIONS: { value: CoachMode; label: string }[] = [
  { value: "target", label: "Repeat the target" },
  { value: "freedom", label: "Say anything" },
];

export default function CoachScreen() {
  const { user } = useAuth();
  const userId = user?.uid ?? "anonymous";
  const readiness = useCoachReadiness();
  const server = useServerStatus();

  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<CoachMode>("target");
  const [history, setHistory] = useState<SavedCoachSession[] | null>(null);

  const loadHistory = useCallback(
    () =>
      readCoachSessions(userId)
        .then(setHistory)
        // Saved history is a convenience; an unreadable store reads as empty.
        .catch(() => setHistory([])),
    [userId],
  );

  const { refreshing, onRefresh } = useRefresh(() => {
    readiness.refresh();
    server.refresh();
    return loadHistory();
  });

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  const sessions = history ?? [];
  const scoredTurns = sessions.flatMap((saved) =>
    saved.turns.map((turn) => turn.assessment?.overallScore).filter((v): v is number => v != null),
  );

  function startSession() {
    if (!readiness.ready) return;
    const chosenTopic = topic.trim() || SUGGESTED_TOPICS[0];
    router.push({ pathname: "/coach/session", params: { topic: chosenTopic, mode } });
  }

  function resume(saved: SavedCoachSession) {
    router.push({
      pathname: "/coach/session",
      params: { topic: saved.topic, mode: saved.replyMode, sessionId: saved.id },
    });
  }

  function confirmDelete(saved: SavedCoachSession) {
    Alert.alert(
      "Delete this conversation?",
      `"${saved.topic}" will be removed from this phone. This cannot be undone.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCoachSession(userId, saved.id)
              .then(() => {
                haptics.success();
                return loadHistory();
              })
              .catch(() => {
                haptics.error();
                Alert.alert("Could not delete", "Something went wrong. Try again in a moment.");
              });
          },
        },
      ],
    );
  }

  const header = (
    <View style={styles.header}>
      <SectionHeader
        eyebrow="Coach"
        title="Freeform practice"
        subtitle="Pick any topic. The coach speaks, you answer, and every reply is scored."
      />

      <ServerBanner />
      {server.reachable ? <ReadinessBanner readiness={readiness} /> : null}

      <Card>
        <TextField
          label="Topic"
          placeholder="What do you want to talk about?"
          value={topic}
          onChangeText={setTopic}
          returnKeyType="go"
          onSubmitEditing={startSession}
        />
        <View style={styles.topicsRow}>
          {SUGGESTED_TOPICS.map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              selected={topic === suggestion}
              onPress={() => setTopic(topic === suggestion ? "" : suggestion)}
            />
          ))}
        </View>

        <OptionRow label="Reply mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <Body size={type.footnote} tone="muted">
          {mode === "target"
            ? "The coach gives you a line to repeat and scores it."
            : "Answer in your own words. Cadence writes down what you said and scores it."}
        </Body>

        <Button label="Start session" disabled={!readiness.ready} onPress={startSession} />
      </Card>

      <View style={styles.historyHead}>
        <Eyebrow>History</Eyebrow>
        {scoredTurns.length > 0 ? (
          <Body size={type.footnote} tone="muted">
            {sessions.length} {sessions.length === 1 ? "conversation" : "conversations"} · avg{" "}
            {averageScore(scoredTurns)}
          </Body>
        ) : null}
      </View>
    </View>
  );

  return (
    <ScreenList
      tab
      refreshing={refreshing}
      onRefresh={onRefresh}
      data={sessions}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        history === null ? (
          <LoadingBlock rows={2} label="Loading your saved conversations…" />
        ) : (
          <EmptyState
            compact
            title="No conversations yet"
            message="Start a topic above. It's saved on this phone so you can pick it up later."
            illustration={ILLUSTRATION_COMMUNICATION}
          />
        )
      }
      renderItem={({ item }) => (
        <HistoryRow saved={item} onResume={() => resume(item)} onDelete={() => confirmDelete(item)} />
      )}
    />
  );
}

function HistoryRow({
  saved,
  onResume,
  onDelete,
}: {
  saved: SavedCoachSession;
  onResume: () => void;
  onDelete: () => void;
}) {
  const turns = saved.turns.length;
  return (
    <Card style={styles.historyCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Resume ${saved.topic}`}
        onPress={onResume}
        style={({ pressed }) => [styles.historyBody, pressedCard(pressed)]}>
        <View style={styles.historyText}>
          <Title size={type.headline} numberOfLines={2}>
            {saved.topic}
          </Title>
          <Body size={type.caption} tone="muted">
            {turns} {turns === 1 ? "turn" : "turns"} · {new Date(saved.updatedAt).toLocaleDateString()} ·{" "}
            {saved.replyMode === "target" ? "Repeat" : "Free"}
          </Body>
        </View>
        <ChevronRight color={colors.slate} size={20} />
      </Pressable>
      <RoundIconButton accessibilityLabel={`Delete ${saved.topic}`} tone="cream" onPress={onDelete}>
        <Trash2 color={colors.brickText} size={18} />
      </RoundIconButton>
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      gap: spacing.lg,
    },
    topicsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    historyHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    historyCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingLeft: spacing.lg,
      paddingRight: spacing.md,
    },
    historyBody: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 44,
    },
    historyText: {
      flex: 1,
      gap: spacing.xxs,
    },
  }),
);
