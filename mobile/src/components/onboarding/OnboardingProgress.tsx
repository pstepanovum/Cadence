import { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";

import { colors, radii, themed } from "@/theme/theme";

/**
 * One thin bar that fills as onboarding goes, springing to each new step. The
 * fill slides in by a transform, so nothing lays out again while it moves.
 * Reduce Motion makes it jump.
 */
export function OnboardingProgress({ current, total }: { current: number; total: number }) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const fraction = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  const shown = useSharedValue(fraction);

  useEffect(() => {
    shown.value = reduceMotion ? fraction : withSpring(fraction, { damping: 20, stiffness: 180 });
  }, [fraction, reduceMotion, shown]);

  const fill = useAnimatedStyle(() => ({ transform: [{ translateX: (shown.value - 1) * width }] }));

  return (
    <View
      style={styles.track}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityLabel="Setup progress"
      accessibilityValue={{ min: 1, max: total, now: current, text: `Step ${current} of ${total}` }}>
      {width > 0 ? <Animated.View style={[styles.fill, fill]} /> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    track: { flex: 1, height: 6, borderRadius: radii.pill, overflow: "hidden", backgroundColor: colors.platinum },
    fill: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: radii.pill, backgroundColor: colors.hunter },
  }),
);
