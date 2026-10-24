// The moment a badge is earned: a card that springs up from the bottom with
// the badge, a success buzz and the completion sound, and leaves by itself
// after a couple of seconds. Quick on purpose; tap to see every badge.
import { router } from "expo-router";
import { Award } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { playCompletionSound } from "@/audio/feedback";
import type { Badge } from "@/engagement/badges";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, shadows, spacing, type, themed } from "@/theme/theme";

const SHOWN_MS = 2600;

export function BadgeCelebration({ badges, onDone }: { badges: Badge[]; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  const pop = useSharedValue(reduceMotion ? 1 : 0.6);
  const key = badges.map((b) => b.id).join(",");

  useEffect(() => {
    if (!key) return;
    haptics.success();
    playCompletionSound();
    const names = badges.map((b) => b.title).join(", ");
    AccessibilityInfo.announceForAccessibility(badges.length === 1 ? `Badge earned: ${names}` : `${badges.length} badges earned: ${names}`);
    shown.value = reduceMotion ? withTiming(1, { duration: 150 }) : withSpring(1, { damping: 16, stiffness: 180 });
    pop.value = reduceMotion ? 1 : withSpring(1, { damping: 9, stiffness: 220 });
    const timer = setTimeout(() => {
      shown.value = withTiming(0, { duration: 220 });
      setTimeout(onDone, 240);
    }, SHOWN_MS);
    return () => clearTimeout(timer);
    // Once per set of badges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const card = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: (1 - shown.value) * 80 }] }));
  const medal = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  if (!key) return null;
  const first = badges[0];
  const title = badges.length === 1 ? first.title : `${badges.length} new badges`;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <Animated.View style={[styles.card, card]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}. See your badges`}
          onPress={() => {
            onDone();
            router.push("/badges");
          }}
          style={styles.row}>
          <Animated.View style={[styles.medal, medal]}>
            <Award color={colors.ink} size={26} strokeWidth={2.5} />
          </Animated.View>
          <View style={styles.text}>
            <Text maxFontSizeMultiplier={maxScale.label} style={styles.kicker}>
              Badge earned
            </Text>
            <Text maxFontSizeMultiplier={maxScale.control} numberOfLines={2} style={styles.title}>
              {title}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    layer: { justifyContent: "flex-end", paddingHorizontal: spacing.lg },
    card: { alignSelf: "center", width: "100%", maxWidth: 480, borderRadius: radii.cardLarge, backgroundColor: colors.snow, boxShadow: shadows.raised },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
    medal: { width: 52, height: 52, borderRadius: radii.pill, backgroundColor: colors.yellowGreen, alignItems: "center", justifyContent: "center" },
    text: { flex: 1, gap: spacing.xxs },
    kicker: { fontFamily: fonts.kicker, fontSize: type.footnote, color: colors.sageText },
    title: { fontFamily: fonts.bodyBold, fontSize: type.headline, color: colors.carbon },
  }),
);
