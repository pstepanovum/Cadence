import { ChevronLeft, X } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { RoundIconButton } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, overlays, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

/** Both ends keep this width whether or not they hold a button, so the bar never shifts. */
const SIDE = 64;

/**
 * Back on the left, the progress bar in the middle, Skip (or a replay's close
 * X) on the right: one 44 pt row.
 */
export function OnboardingTopBar({
  current,
  total,
  onBack,
  onSkip,
  onClose,
}: {
  current: number;
  total: number;
  onBack?: () => void;
  onSkip?: () => void;
  onClose?: () => void;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack ? (
          <RoundIconButton accessibilityLabel="Back" onPress={onBack}>
            <ChevronLeft color={colors.hunter} size={22} />
          </RoundIconButton>
        ) : null}
      </View>
      <OnboardingProgress current={current} total={total} />
      <View style={[styles.side, styles.end]}>
        {onClose ? (
          <RoundIconButton accessibilityLabel="Close setup" onPress={onClose}>
            <X color={colors.hunter} size={20} />
          </RoundIconButton>
        ) : onSkip ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip"
            hitSlop={8}
            onPress={() => {
              haptics.tap();
              onSkip();
            }}
            style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}>
            <Text maxFontSizeMultiplier={maxScale.control} style={styles.skipLabel}>
              Skip
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: { minHeight: TAP_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.md },
    side: { width: SIDE, minHeight: TAP_TARGET, flexDirection: "row", alignItems: "center" },
    end: { justifyContent: "flex-end" },
    skip: { minHeight: TAP_TARGET, paddingHorizontal: spacing.sm, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
    skipPressed: { backgroundColor: overlays.hunterTint },
    skipLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.headline, color: colors.hunter },
  }),
);
