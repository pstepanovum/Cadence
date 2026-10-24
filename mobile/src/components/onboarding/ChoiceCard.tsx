import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, shadows, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

/** One answer on a question step: a title, an optional line, and a tick when chosen. */
export function ChoiceCard({
  title,
  detail,
  selected,
  onPress,
  icon,
}: {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
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
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={maxScale.control} style={styles.title}>
          {title}
        </Text>
        {detail ? (
          <Text maxFontSizeMultiplier={maxScale.control} style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={[styles.tick, selected && styles.tickOn]}>{selected ? <Check color={colors.snow} size={14} strokeWidth={3} /> : null}</View>
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
      backgroundColor: colors.snow,
      borderWidth: 2,
      borderColor: "transparent",
      boxShadow: shadows.card,
    },
    selected: { borderColor: colors.sage, backgroundColor: colors.limeSoft },
    pressed: { opacity: 0.85 },
    icon: { width: 36, alignItems: "center" },
    text: { flex: 1, gap: spacing.xxs },
    title: { fontFamily: fonts.bodySemiBold, fontSize: type.headline, color: colors.carbon },
    detail: { fontFamily: fonts.body, fontSize: type.footnote, color: colors.slate },
    tick: { width: 24, height: 24, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.paleSlate, alignItems: "center", justifyContent: "center" },
    tickOn: { backgroundColor: colors.hunter, borderColor: colors.hunter },
  }),
);
