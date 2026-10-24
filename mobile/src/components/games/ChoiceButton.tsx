import { Check, X } from "lucide-react-native";
import { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, maxScale, radii, shadows, spacing, type, themed } from "@/theme/theme";

export type ChoiceState = "idle" | "selected" | "correct" | "wrong" | "dimmed";

const palette: Record<ChoiceState, { bg: string; fg: string; sub: string }> = themed(() => ({
  idle: { bg: colors.white, fg: colors.hunter, sub: colors.iron },
  selected: { bg: colors.limeSoft, fg: colors.hunter, sub: colors.iron },
  correct: { bg: colors.yellowGreen, fg: colors.ink, sub: colors.ink },
  wrong: { bg: colors.brick, fg: colors.snow, sub: "rgba(248,249,250,0.85)" },
  dimmed: { bg: colors.white, fg: colors.slate, sub: colors.slate },
}));

/**
 * One answer in a multiple-choice round. It shrinks slightly under the thumb
 * and, once answered, turns green or red and shows a tick or a cross so the
 * verdict never rests on colour alone.
 */
export function ChoiceButton({
  label,
  sublabel,
  badge,
  state = "idle",
  disabled = false,
  onPress,
  testID,
}: {
  label: string;
  sublabel?: string;
  /** A short tag at the left, e.g. "A". */
  badge?: string;
  state?: ChoiceState;
  disabled?: boolean;
  onPress: () => void;
  /** For the end-to-end flows. */
  testID?: string;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const tone = palette[state];

  function pressTo(value: number) {
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
      accessibilityState={{ disabled, selected: state === "selected" || state === "correct" || state === "wrong" }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => pressTo(0.97)}
      onPressOut={() => pressTo(1)}>
      <Animated.View
        style={[
          styles.choice,
          { backgroundColor: tone.bg, transform: [{ scale }] },
          state === "dimmed" && { opacity: 0.55 },
        ]}>
        {badge ? (
          <View style={[styles.badge, (state === "correct" || state === "wrong") && styles.badgeOnColour]}>
            <Text
              maxFontSizeMultiplier={maxScale.label}
              style={[styles.badgeText, { color: state === "wrong" ? colors.snow : colors.hunter }]}>
              {badge}
            </Text>
          </View>
        ) : null}
        <View style={styles.body}>
          <Text maxFontSizeMultiplier={maxScale.control} style={[styles.label, { color: tone.fg }]}>
            {label}
          </Text>
          {sublabel ? (
            <Text maxFontSizeMultiplier={maxScale.control} style={[styles.sublabel, { color: tone.sub }]}>
              {sublabel}
            </Text>
          ) : null}
        </View>
        {state === "correct" ? <Check color={colors.ink} size={22} /> : null}
        {state === "wrong" ? <X color={colors.snow} size={22} /> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    choice: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.card,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      minHeight: 60,
      boxShadow: shadows.card,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: radii.pill,
      backgroundColor: colors.cream,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeOnColour: {
      backgroundColor: "rgba(255,255,255,0.35)",
    },
    badgeText: {
      fontFamily: fonts.kicker,
      fontSize: type.footnote,
    },
    body: {
      flex: 1,
      gap: 2,
    },
    label: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.body + 1,
      lineHeight: 22,
    },
    sublabel: {
      fontFamily: fonts.body,
      fontSize: type.footnote,
      lineHeight: 18,
    },
  }),
);
