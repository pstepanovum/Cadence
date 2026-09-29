import { router, useFocusEffect } from "expo-router";
import { Play, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import type { CoachMode } from "@/api/types";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  EmptyState,
  OptionRow,
  PillButton,
  RoundIconButton,
  Screen,
  SectionHeader,
  StatTile,
  TextField,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { ILLUSTRATION_COMMUNICATION } from "@/data/svg";
import { useCoachReadiness } from "@/hooks/useEngineReadiness";
import { useServerStatus } from "@/hooks/useServerStatus";
import { deleteCoachSession, readCoachSessions, type SavedCoachSession } from "@/lib/coach-storage";
import { averageScore } from "@/practice/scoring";
import { colors, spacing } from "@/theme/theme";

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
  const { session } = useAuth();
  const userId = session?.user.id ?? "anonymous";
  const readiness = useCoachReadiness();
  const server = useServerStatus();

  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<CoachMode>("target");
  const [history, setHistory] = useState<SavedCoachSession[] | null>(null);

  const loadHistory = useCallback(() => {
    readCoachSessions(userId).then(setHistory);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  const sessions = history ?? [];
  const scoredTurns = sessions.flatMap((saved) =>
    saved.turns.map((turn) => turn.assessment?.overallScore).filter((v): v is number => v != null),
  );

  function startSession() {
    const chosenTopic = topic.trim() || SUGGESTED_TOPICS[0];
    router.push({ pathname: "/coach/session", params: { topic: chosenTopic, mode } });
  }

  function confirmDelete(saved: SavedCoachSession) {
    Alert.alert(
      "Delete this conversation?",
      `"${saved.topic}" and its ${saved.turns.length} ${saved.turns.length === 1 ? "turn" : "turns"} will be removed from this device. This cannot be undone.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCoachSession(userId, saved.id).then(loadHistory);
          },
        },
      ],
    );
  }

  return (
    <Screen>
      {!server.reachable && !server.checking ? (
        <Banner
          tone="error"
          message={server.message ?? "Cadence can't reach the server."}
          actionLabel={server.actionLabel ?? "Try again"}
          onAction={server.refresh}
        />
      ) : null}

      <SectionHeader
        eyebrow="AI Coach"
        title="Freeform practice"
        subtitle="Pick any topic. The coach speaks, you answer, and every reply gets scored."
      />

      {sessions.length > 0 ? (
        <Card variant="dark">
          <Eyebrow onDark>So far</Eyebrow>
          <View style={styles.statsRow}>
            <StatTile tone="translucent" label="Conversations" value={String(sessions.length)} />
            <StatTile tone="translucent" label="Turns scored" value={String(scoredTurns.length)} />
            <StatTile
              tone="translucent"
              label="Avg score"
              value={scoredTurns.length ? String(averageScore(scoredTurns)) : "—"}
            />
          </View>
        </Card>
      ) : null}

      {!readiness.ready ? (
        <Banner
          tone={readiness.offline ? "error" : "warning"}
          message={readiness.checking ? "Checking the coach…" : (readiness.message ?? "")}
          actionLabel={readiness.checking ? undefined : "Check again"}
          onAction={readiness.checking ? undefined : readiness.refresh}
        />
      ) : null}

      <Card>
        <Eyebrow>New session</Eyebrow>
        <TextField
          placeholder="What do you want to talk about?"
          value={topic}
          onChangeText={setTopic}
          returnKeyType="go"
          onSubmitEditing={() => readiness.ready && startSession()}
        />
        <View style={styles.topicsRow}>
          {SUGGESTED_TOPICS.map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              status={topic === suggestion ? "correct" : "neutral"}
              onPress={() => setTopic(suggestion)}
            />
          ))}
        </View>

        <OptionRow label="Reply mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        <Body size={12}>
          {mode === "target"
            ? "The coach gives you a sentence to repeat, scored against that exact target."
            : "Answer in your own words — Cadence transcribes what you said and scores your pronunciation of it."}
        </Body>

        <PillButton
          label="Start session"
          disabled={!readiness.ready}
          onPress={startSession}
        />
        {!readiness.ready ? (
          <Body size={12} style={styles.centerText}>
            Starting unlocks as soon as the coach answers.
          </Body>
        ) : null}
      </Card>

      <Eyebrow>History</Eyebrow>

      {history === null ? (
        <Body size={13}>Loading your saved conversations…</Body>
      ) : sessions.length === 0 ? (
        <EmptyState
          compact
          title="No conversations yet"
          message="Start a topic above and it will be saved here on this device, ready to pick back up."
          illustration={ILLUSTRATION_COMMUNICATION}
        />
      ) : (
        sessions.map((saved) => (
          <Card key={saved.id} style={styles.historyCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Resume ${saved.topic}`}
              style={styles.historyBody}
              onPress={() =>
                router.push({
                  pathname: "/coach/session",
                  params: { topic: saved.topic, mode: saved.replyMode, sessionId: saved.id },
                })
              }>
              <Title size={16} numberOfLines={2}>
                {saved.topic}
              </Title>
              <Body size={12}>
                {saved.turns.length} {saved.turns.length === 1 ? "turn" : "turns"} ·{" "}
                {new Date(saved.updatedAt).toLocaleDateString()} ·{" "}
                {saved.replyMode === "target" ? "repeat mode" : "free mode"}
              </Body>
            </Pressable>
            <RoundIconButton
              accessibilityLabel={`Resume ${saved.topic}`}
              tone="cream"
              onPress={() =>
                router.push({
                  pathname: "/coach/session",
                  params: { topic: saved.topic, mode: saved.replyMode, sessionId: saved.id },
                })
              }>
              <Play color={colors.hunter} size={16} />
            </RoundIconButton>
            <RoundIconButton
              accessibilityLabel={`Delete ${saved.topic}`}
              tone="cream"
              onPress={() => confirmDelete(saved)}>
              <Trash2 color={colors.brick} size={16} />
            </RoundIconButton>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  topicsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  historyBody: {
    flex: 1,
    gap: 2,
  },
  centerText: {
    textAlign: "center",
  },
});
