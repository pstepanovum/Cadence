import { Volume2 } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, shadows, spacing, type } from "@/theme/theme";

/**
 * The big "hear it" control. Large on purpose: in Spelling Bee and Sound Match
 * it is the whole prompt, so it has to be the thing the thumb goes to.
 */
export function SpeakerButton({
  onPress,
  loading = false,
  playing = false,
  label = "Hear the word",
  size = 96,
  disabled = false,
}: {
  onPress: () => void;
  loading?: boolean;
  playing?: boolean;
  label?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy: loading }}
        disabled={disabled}
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            backgroundColor: playing ? colors.yellowGreen : colors.hunter,
            boxShadow: disabled ? undefined : shadows.raised,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}>
        {loading ? (
          <ActivityIndicator color={playing ? colors.ink : colors.snow} />
        ) : (
          <Volume2 color={playing ? colors.ink : colors.snow} size={size * 0.4} />
        )}
      </Pressable>
      <Text maxFontSizeMultiplier={maxScale.control} style={styles.label}>
        {playing ? "Playing…" : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: type.footnote,
    color: colors.hunter,
  },
});
