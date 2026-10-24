import { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii } from "@/theme/theme";

export type TileState = "pool" | "placed" | "correct" | "wrong" | "empty" | "ghost";

const palette: Record<TileState, { bg: string; fg: string; border: string }> = {
  pool: { bg: colors.snow, fg: colors.hunter, border: "transparent" },
  placed: { bg: colors.cream, fg: colors.hunter, border: colors.yellowGreen },
  correct: { bg: colors.yellowGreen, fg: colors.hunter, border: colors.yellowGreen },
  wrong: { bg: colors.brick, fg: colors.snow, border: colors.brick },
  /** A slot waiting for a letter. */
  empty: { bg: "transparent", fg: colors.paleSlate, border: colors.paleSlate },
  /** A pool tile already used — keeps its space so the row does not jump. */
  ghost: { bg: "transparent", fg: colors.paleSlate, border: colors.alabaster },
};

/** One letter in the scramble game. Tiles shrink as they are tapped. */
export function LetterTile({
  letter,
  state = "pool",
  size = 44,
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
          borderColor: tone.border,
          borderStyle: state === "empty" || state === "ghost" ? "dashed" : "solid",
          transform: [{ scale }],
        },
      ]}>
      <Text style={[styles.letter, { color: tone.fg, fontSize: size * 0.5 }]}>
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

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.panel,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontFamily: fonts.kickerBold,
  },
});
