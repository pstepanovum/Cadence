import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

/**
 * One answer on a question step: a flat grey row that turns primary green,
 * with a white tick, when chosen. `compact` tightens it for short phones so a
 * six-option step still fits an iPhone SE without scrolling.
 */
export function ChoiceCard({
  title,
  detail,
  selected,
  onPress,
  icon,
  compact = false,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  /** Drawn in the row's text colour, so it stays visible once the row turns green. */
  icon?: (selected: boolean) => React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={() => {
        if (!selected) haptics.select();
        onPress();
      }}
      style={({ pressed }) => [styles.card, compact && styles.compact, selected && styles.selected, pressed && styles.pressed]}>
      {icon ? <View style={styles.icon}>{icon(selected)}</View> : null}
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={maxScale.control} style={[styles.title, compact && styles.titleCompact, selected && styles.onSelected]}>
          {title}
        </Text>
        {detail ? (
          <Text maxFontSizeMultiplier={maxScale.control} style={[styles.detail, selected && styles.detailOnSelected]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={[styles.tick, selected && styles.tickOn]}>{selected ? <Check color={colors.hunter} size={14} strokeWidth={3} /> : null}</View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: TAP_TARGET + 12,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.control,
      backgroundColor: colors.platinum,
    },
    compact: { minHeight: TAP_TARGET, paddingVertical: spacing.sm },
    selected: { backgroundColor: colors.hunter },
    pressed: { opacity: 0.85 },
    icon: { width: 28, alignItems: "center" },
    text: { flex: 1, gap: spacing.xxs },
    title: { fontFamily: fonts.bodySemiBold, fontSize: type.headline, lineHeight: 22, color: colors.carbon },
    titleCompact: { fontSize: type.body, lineHeight: 20 },
    detail: { fontFamily: fonts.body, fontSize: type.footnote, lineHeight: 17, color: colors.slate },
    onSelected: { color: colors.snow },
    detailOnSelected: { color: colors.onDarkMuted },
    tick: { width: 24, height: 24, borderRadius: radii.pill, backgroundColor: colors.alabaster, alignItems: "center", justifyContent: "center" },
    tickOn: { backgroundColor: colors.snow },
  }),
);
