import { Pause, Play } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Body, Eyebrow, RoundIconButton } from "@/components/ui";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

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
        <Eyebrow>Coach</Eyebrow>
        <RoundIconButton
          accessibilityLabel={state === "idle" ? "Play this coach line" : "Stop this coach line"}
          tone="cream"
          size={36}
          onPress={onToggle}>
          {state === "loading" ? (
            <ActivityIndicator color={colors.hunter} size="small" />
          ) : state === "playing" ? (
            <Pause color={colors.hunter} size={16} />
          ) : (
            <Play color={colors.hunter} size={16} />
          )}
        </RoundIconButton>
      </View>
      <Body size={type.body} style={{ color: colors.carbon }}>
        {message}
      </Body>
      {note ? (
        <Body tone="muted" size={type.caption}>
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

const styles = themed(() =>
  StyleSheet.create({
    bubble: {
      borderRadius: radii.card,
      borderTopLeftRadius: spacing.xs,
      backgroundColor: colors.platinum,
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
      backgroundColor: colors.snow,
      boxShadow: shadows.card,
      padding: spacing.lg,
      gap: spacing.xs,
      marginLeft: spacing.xl,
    },
  }),
);
