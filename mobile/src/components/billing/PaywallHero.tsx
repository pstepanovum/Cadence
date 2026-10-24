// The top of the Plus paywall: an illustration on a soft panel, the name and
// one line. It settles in with a short fade and lift (none with Reduce Motion).
import { useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { Illustration } from "@/components/Illustration";
import { Body, Eyebrow, Title } from "@/components/ui";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

export function PaywallHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: reduceMotion ? 0 : 420, easing: Easing.out(Easing.cubic) });
  }, [shown, reduceMotion]);
  const art = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 12 }] }));
  // Smaller on short phones, so the plans stay in view on an iPhone SE.
  const size = Math.round(Math.min(width - 96, height * 0.24, 260));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.panel, art]}>
        <Illustration name="success" size={size} />
      </Animated.View>
      <View style={styles.text}>
        <Eyebrow>Cadence Plus</Eyebrow>
        <Title size={type.title1} style={styles.center}>
          {title}
        </Title>
        {subtitle ? (
          <Body size={type.callout} tone="muted" style={styles.center}>
            {subtitle}
          </Body>
        ) : null}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { gap: spacing.lg, alignItems: "center" },
    panel: { alignSelf: "stretch", alignItems: "center", paddingVertical: spacing.md, borderRadius: radii.cardLarge, backgroundColor: colors.limeSoft },
    text: { alignItems: "center", gap: spacing.xs },
    center: { textAlign: "center" },
  }),
);
