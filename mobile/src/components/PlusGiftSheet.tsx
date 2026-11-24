// "Plus is on": a half sheet that rises from the bottom when Plus turns on
// from a grant (PlusGiftWatcher decides when). The Plus illustration pops in,
// then a big headline, one line and Done. Tapping outside closes it too.
// Never mentions where Plus came from.
import { useEffect, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Illustration } from "@/components/Illustration";
import { Body, Button, Title } from "@/components/ui";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

export type PlusGiftContent = { title: string; body: string };

export function PlusGiftSheet({ content, onClose }: { content: PlusGiftContent | null; onClose: () => void }) {
  return content ? <Sheet key={`${content.title}|${content.body}`} content={content} onClose={onClose} /> : null;
}

function Sheet({ content, onClose }: { content: PlusGiftContent; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  const pop = useSharedValue(reduceMotion ? 1 : 0.5);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${content.title}. ${content.body}`);
    shown.set(withTiming(1, { duration: reduceMotion ? 150 : 320, easing: Easing.out(Easing.cubic) }));
    if (!reduceMotion) pop.set(withDelay(140, withSpring(1, { damping: 8, stiffness: 200, mass: 0.8 })));
    // Once, as the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    shown.set(
      withTiming(0, { duration: reduceMotion ? 120 : 220, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(onClose);
      }),
    );
  };

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - shown.value) * height }] }));
  const art = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 1.6 - 0.6), transform: [{ scale: pop.value }, { rotate: `${(1 - pop.value) * -16}deg` }] }));

  // Large, but the sheet stays about half the screen on an iPhone SE.
  const size = Math.round(Math.min(width * 0.56, height * 0.26, 240));

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close" onPress={close} />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.layer}>
        <Animated.View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }, sheet]}>
          <View style={styles.grabber} />
          <Animated.View style={art}>
            <Illustration name="success" size={size} />
          </Animated.View>
          <View style={styles.text}>
            <Title size={type.display} style={styles.center}>
              {content.title}
            </Title>
            <Body size={type.headline} tone="muted" style={styles.center}>
              {content.body}
            </Body>
          </View>
          <Button label="Done" onPress={close} style={styles.button} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    scrim: { backgroundColor: "rgba(17, 20, 22, 0.42)" },
    layer: { flex: 1, justifyContent: "flex-end" },
    sheet: {
      alignSelf: "center",
      width: "100%",
      maxWidth: 560,
      alignItems: "center",
      gap: spacing.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderTopLeftRadius: radii.cardLarge,
      borderTopRightRadius: radii.cardLarge,
      backgroundColor: colors.cream,
    },
    grabber: { width: 40, height: 5, borderRadius: radii.pill, backgroundColor: colors.alabaster, marginBottom: spacing.xs },
    text: { alignItems: "center", gap: spacing.sm },
    center: { textAlign: "center" },
    button: { alignSelf: "stretch", marginTop: spacing.xs },
  }),
);
