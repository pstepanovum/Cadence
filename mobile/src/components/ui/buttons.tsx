import { Check } from "lucide-react-native";
import { Children } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, overlays, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "danger" | "neutral";

const buttonColors: Record<ButtonVariant, { bg: string; fg: string }> = themed(() => ({
  primary: { bg: colors.hunter, fg: colors.snow },
  /** Secondary actions are filled grey, never yellow-green or outlined. */
  secondary: { bg: colors.platinum, fg: colors.carbon },
  tonal: { bg: overlays.hunterTint, fg: colors.hunter },
  danger: { bg: colors.brick, fg: colors.snow },
  /** The quiet choice beside a primary button ("Not now"): filled grey, no stroke. */
  neutral: { bg: colors.platinum, fg: colors.carbon },
}));

/** The colour an icon inside a button of this variant should use. */
export function buttonIconColor(variant: ButtonVariant = "primary"): string {
  return buttonColors[variant].fg;
}

export function Button({
  label,
  variant = "primary",
  loading = false,
  icon,
  style,
  disabled,
  onPress,
  ...props
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = buttonColors[variant];
  const inactive = Boolean(disabled) || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg },
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
      {...props}
      onPress={(event) => {
        // On release, not on touch-down: a touch that turns into a scroll
        // should not buzz.
        haptics.tap();
        onPress?.(event);
      }}>
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon}
          <Text
            maxFontSizeMultiplier={maxScale.control}
            numberOfLines={2}
            style={[styles.buttonLabel, { color: palette.fg }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Buttons side by side while they fit, stacked once the screen is narrow or
 * the text is large, so a two-button row never clips on an iPhone SE.
 */
export function ActionRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { width, fontScale } = useWindowDimensions();
  const items = Children.toArray(children);
  // Room per button after the screen gutters and a card's padding.
  const perButton = (Math.min(width, 640) - 64) / Math.max(items.length, 1);
  const stacked = fontScale > 1.2 || perButton < 96;
  return (
    <View style={[stacked ? styles.actionColumn : styles.actionRow, style]}>
      {items.map((child, index) => (
        <View key={index} style={stacked ? undefined : styles.actionCell}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** A circular icon button — back arrows, close buttons, inline speaker taps. */
export function RoundIconButton({
  children,
  onPress,
  accessibilityLabel,
  tone = "light",
  size = TAP_TARGET,
  disabled = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: "light" | "cream" | "translucent";
  size?: number;
  disabled?: boolean;
}) {
  const background =
    tone === "cream" ? colors.cream : tone === "translucent" ? overlays.whiteOnGreenStrong : colors.white;
  // Smaller visuals keep a 44pt target.
  const slop = Math.max(0, Math.ceil((TAP_TARGET - size) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      hitSlop={slop + 4}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          backgroundColor: background,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        tone === "light" && styles.roundShadow,
      ]}>
      {children}
    </Pressable>
  );
}

export type ChipStatus = "correct" | "mixed" | "needs-work" | "neutral" | "accent";

const chipPalette: Record<ChipStatus, { bg: string; fg: string }> = themed(() => ({
  correct: { bg: colors.yellowGreen, fg: colors.ink },
  mixed: { bg: colors.mixedChip, fg: colors.ink },
  "needs-work": { bg: colors.brick, fg: colors.snow },
  neutral: { bg: colors.platinum, fg: colors.iron },
  accent: { bg: colors.hunter, fg: colors.snow },
}));

/**
 * A tag, a tappable word, or one option in a picker. Pass `selected` to make
 * it a picker option: it then shows a tick and announces its state, so the
 * choice never rests on colour alone.
 */
export function Chip({
  label,
  status = "neutral",
  onPress,
  onLongPress,
  active = false,
  selected,
  accessibilityHint,
  style,
  testID,
}: {
  label: string;
  status?: ChipStatus;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Dims the chip to show it is the one currently playing. */
  active?: boolean;
  selected?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  /** For the end-to-end flows. */
  testID?: string;
}) {
  const picker = selected !== undefined;
  const interactive = Boolean(onPress || onLongPress);
  const palette = picker
    ? selected
      ? { bg: colors.hunter, fg: colors.snow }
      : { bg: colors.white, fg: colors.iron }
    : chipPalette[status];

  const content = (
    <View
      style={[
        styles.chip,
        interactive && styles.chipInteractive,
        { backgroundColor: palette.bg },
        picker && !selected && styles.chipPickerIdle,
        active && styles.chipActive,
        style,
      ]}>
      {picker && selected ? <Check color={colors.lime} size={14} strokeWidth={3} /> : null}
      <Text
        maxFontSizeMultiplier={maxScale.control}
        style={[styles.chipLabel, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );

  if (!interactive) return content;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={picker ? { selected } : undefined}
      onPress={() => {
        haptics.select();
        onPress?.();
      }}
      onLongPress={onLongPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [pressed && styles.chipPressed]}>
      {content}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radii.control,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    buttonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    buttonLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.body,
      lineHeight: 20,
      textAlign: "center",
      flexShrink: 1,
    },
    actionRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    actionColumn: {
      gap: spacing.sm,
    },
    actionCell: {
      flex: 1,
    },
    round: {
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    roundShadow: {
      boxShadow: "0px 1px 4px rgba(33, 37, 41, 0.08)",
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      minHeight: 28,
      alignSelf: "flex-start",
    },
    chipInteractive: {
      minHeight: 40,
      paddingHorizontal: spacing.lg,
    },
    chipPickerIdle: {
      backgroundColor: colors.platinum,
    },
    chipActive: {
      opacity: 0.6,
    },
    chipPressed: {
      opacity: 0.75,
    },
    chipLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.footnote,
      lineHeight: 18,
    },
  }),
);
