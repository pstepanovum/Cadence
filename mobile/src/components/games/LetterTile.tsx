import { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii, shadows, TAP_TARGET, themed } from "@/theme/theme";

export type TileState = "pool" | "placed" | "correct" | "wrong" | "empty" | "ghost";

const palette: Record<TileState, { bg: string; fg: string }> = themed(() => ({
  pool: { bg: colors.white, fg: colors.hunter },
  placed: { bg: colors.limeSoft, fg: colors.hunter },
  correct: { bg: colors.yellowGreen, fg: colors.ink },
  wrong: { bg: colors.brick, fg: colors.snow },
  /** A slot waiting for a letter. */
  empty: { bg: colors.platinum, fg: colors.paleSlate },
  /** A pool tile already used — keeps its space so the row does not jump. */
  ghost: { bg: colors.platinum, fg: colors.paleSlate },
}));

/** One letter in the scramble game. Tiles shrink as they are tapped. */
export function LetterTile({
  letter,
  state = "pool",
  size = TAP_TARGET,
  onPress,
}: {
  letter: string;
  state?: TileState;
  size?: number;
  onPress?: () => void;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const tone = palette[state];
  const interactive = !!onPress && (state === "pool" || state === "placed");

  function pressTo(value: number) {
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  }

  const content = (
    <Animated.View
      style={[
        styles.tile,
        {
          width: size,
          height: size * 1.15,
          backgroundColor: tone.bg,
          borderStyle: state === "empty" || state === "ghost" ? "dashed" : "solid",
          transform: [{ scale }],
        },
        state === "pool" && styles.lifted,
      ]}>
      <Text allowFontScaling={false} style={[styles.letter, { color: tone.fg, fontSize: size * 0.5 }]}>
        {state === "empty" || state === "ghost" ? "" : letter.toUpperCase()}
      </Text>
    </Animated.View>
  );

  if (!interactive) return <View>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={state === "placed" ? `Remove ${letter}` : `Add ${letter}`}
      onPress={onPress}
      onPressIn={() => pressTo(0.9)}
      onPressOut={() => pressTo(1)}>
      {content}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tile: {
      borderRadius: radii.tile,
      alignItems: "center",
      justifyContent: "center",
    },
    lifted: {
      boxShadow: shadows.card,
    },
    // Full width: measured on its own, a narrow glyph such as "I" got no room.
    letter: {
      alignSelf: "stretch",
      textAlign: "center",
      fontFamily: fonts.kickerBold,
    },
  }),
);
