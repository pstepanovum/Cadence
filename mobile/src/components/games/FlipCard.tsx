import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { colors, radii } from "@/theme/theme";

/**
 * A card with two faces that turns over around its vertical axis. The faces
 * are stacked, and each hides its back, so whichever is facing the learner is
 * the only one that can be seen or tapped.
 */
export function FlipCard({
  flipped,
  front,
  back,
  onPress,
  height = 300,
}: {
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  onPress: () => void;
  height?: number;
}) {
  const [progress] = useState(() => new Animated.Value(flipped ? 1 : 0));

  useEffect(() => {
    Animated.spring(progress, {
      toValue: flipped ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [flipped, progress]);

  const frontRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={flipped ? "Show the word" : "Show the meaning"}
      accessibilityHint="Flips the card"
      onPress={onPress}
      style={[styles.wrap, { height }]}>
      <Animated.View
        pointerEvents={flipped ? "none" : "auto"}
        style={[styles.face, styles.front, { transform: [{ perspective: 1200 }, { rotateY: frontRotate }] }]}>
        {front}
      </Animated.View>
      <Animated.View
        pointerEvents={flipped ? "auto" : "none"}
        style={[styles.face, styles.back, { transform: [{ perspective: 1200 }, { rotateY: backRotate }] }]}>
        {back}
      </Animated.View>
      <View />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  face: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.cardLarge,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backfaceVisibility: "hidden",
  },
  front: {
    backgroundColor: colors.snow,
  },
  back: {
    backgroundColor: colors.hunter,
  },
});
