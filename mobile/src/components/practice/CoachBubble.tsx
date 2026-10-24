import { Pause, Play } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Body, Eyebrow, RoundIconButton } from "@/components/ui";
import { colors, radii, spacing, type } from "@/theme/theme";

/**
 * One line from the coach, with its own play button. `state` belongs to this
 * bubble alone, so only the line that is actually speaking shows Pause.
 */
export function CoachBubble({
  message,
  state,
  onToggle,
  note,
}: {
  message: string;
  state: "idle" | "loading" | "playing";
  onToggle: () => void;
  /** A small line under the message, e.g. when the audio failed. */
  note?: string;
}) {
  return (
    <View style={styles.bubble}>
      <View style={styles.header}>
        <Eyebrow onDark>Coach</Eyebrow>
        <RoundIconButton
          accessibilityLabel={state === "idle" ? "Play this coach line" : "Stop this coach line"}
          tone="translucent"
          size={36}
          onPress={onToggle}>
          {state === "loading" ? (
            <ActivityIndicator color={colors.lime} size="small" />
          ) : state === "playing" ? (
            <Pause color={colors.lime} size={16} />
          ) : (
            <Play color={colors.lime} size={16} />
          )}
        </RoundIconButton>
      </View>
      <Body onDark size={type.body}>
        {message}
      </Body>
      {note ? (
        <Body onDark tone="muted" size={type.caption}>
          {note}
        </Body>
      ) : null}
    </View>
  );
}

/** What the learner should say, or what they said. */
export function ReplyPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.reply}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: radii.card,
    borderTopLeftRadius: spacing.xs,
    backgroundColor: colors.hunter,
    padding: spacing.lg,
    gap: spacing.sm,
    marginRight: spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reply: {
    borderRadius: radii.card,
    borderTopRightRadius: spacing.xs,
    backgroundColor: colors.white,
    padding: spacing.lg,
    gap: spacing.xs,
    marginLeft: spacing.xl,
  },
});
