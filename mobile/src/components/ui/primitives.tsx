import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts, overlays, radii, scoreColor, spacing } from "@/theme/theme";

export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pass both to enable pull-to-refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.screenContent, style, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.hunter}
            colors={[colors.hunter]}
          />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }, style, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {content}
    </SafeAreaView>
  );
}

export function Card({
  children,
  variant = "light",
  style,
}: {
  children: React.ReactNode;
  variant?: "light" | "dark" | "cream";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.card,
        variant === "dark" && { backgroundColor: colors.hunter },
        variant === "cream" && { backgroundColor: colors.cream },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Title({
  children,
  onDark = false,
  size = 20,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  size?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: fonts.kicker,
          fontSize: size,
          lineHeight: size * 1.25,
          color: onDark ? colors.snow : colors.hunter,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  onDark = false,
  size = 14,
  weight = "regular",
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  size?: number;
  weight?: "regular" | "medium" | "semibold" | "bold";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const family =
    weight === "bold"
      ? fonts.bodyBold
      : weight === "semibold"
        ? fonts.bodySemiBold
        : weight === "medium"
          ? fonts.bodyMedium
          : fonts.body;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: family,
          fontSize: size,
          lineHeight: size * 1.5,
          color: onDark ? "rgba(248,249,250,0.92)" : colors.iron,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Eyebrow({
  children,
  onDark = false,
  tone,
  style,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  /** Overrides the colour — used for the exam's brick-red labels. */
  tone?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.kicker,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: tone ?? (onDark ? colors.yellowGreen : colors.sage),
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

/** Eyebrow + title + optional supporting line — the top of nearly every screen. */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  size = 28,
  onDark = false,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  size?: number;
  onDark?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        {eyebrow ? <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow> : null}
        <Title size={size} onDark={onDark}>
          {title}
        </Title>
        {subtitle ? (
          <Body size={13} onDark={onDark}>
            {subtitle}
          </Body>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

type PillVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const pillColors: Record<PillVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.hunter, fg: colors.snow },
  secondary: { bg: colors.yellowGreen, fg: colors.hunter },
  ghost: { bg: colors.cream, fg: colors.hunter },
  danger: { bg: colors.brick, fg: colors.snow },
  outline: { bg: "transparent", fg: colors.hunter },
};

export function PillButton({
  label,
  variant = "primary",
  loading = false,
  icon,
  style,
  disabled,
  ...props
}: PressableProps & {
  label: string;
  variant?: PillVariant;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = pillColors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: palette.bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "outline" && styles.pillOutline,
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.pillLabel, { color: palette.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A circular icon button — back arrows, close buttons, inline speaker taps. */
export function RoundIconButton({
  children,
  onPress,
  accessibilityLabel,
  tone = "light",
  size = 40,
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
    tone === "cream" ? colors.cream : tone === "translucent" ? overlays.whiteOnGreenStrong : colors.snow;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}>
      {children}
    </Pressable>
  );
}

export type ChipStatus = "correct" | "mixed" | "needs-work" | "neutral" | "accent";

const chipPalette: Record<ChipStatus, { bg: string; fg: string }> = {
  correct: { bg: colors.yellowGreen, fg: colors.hunter },
  mixed: { bg: colors.mixedChip, fg: colors.hunter },
  "needs-work": { bg: colors.brick, fg: colors.snow },
  neutral: { bg: colors.platinum, fg: colors.iron },
  accent: { bg: colors.hunter, fg: colors.snow },
};

export function Chip({
  label,
  status = "neutral",
  onPress,
  onLongPress,
  active = false,
  accessibilityHint,
  style,
}: {
  label: string;
  status?: ChipStatus;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Dims the chip to show it is the one currently playing. */
  active?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = chipPalette[status];
  const content = (
    <View style={[styles.chip, { backgroundColor: palette.bg }, active && styles.chipActive, style]}>
      <Text style={[styles.chipLabel, { color: palette.fg }]}>{label}</Text>
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
      {content}
    </Pressable>
  );
}

export function ProgressBar({
  value,
  onDark = false,
  style,
}: {
  value: number;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      style={[
        styles.progressTrack,
        { backgroundColor: onDark ? overlays.whiteOnGreenStrong : colors.alabaster },
        style,
      ]}>
      <View style={[styles.progressFill, { width: `${clamped}%` }]} />
    </View>
  );
}

/**
 * The web app's WordQueue: one segment per word or turn, so the learner can see
 * how much of the round is behind them at a glance.
 */
export function SegmentedProgress({
  total,
  currentIndex,
  onDark = false,
}: {
  total: number;
  /** Index of the item being worked on right now. */
  currentIndex: number;
  onDark?: boolean;
}) {
  return (
    <View
      style={styles.segments}
      accessibilityRole="progressbar"
      accessibilityLabel={`Item ${Math.min(currentIndex + 1, total)} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            {
              backgroundColor:
                index < currentIndex
                  ? colors.yellowGreen
                  : index === currentIndex
                    ? colors.hunter
                    : onDark
                      ? overlays.whiteOnGreenStrong
                      : colors.platinum,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function ProgressRing({
  score,
  size = 72,
  strokeWidth = 6,
  label,
  onDark = false,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  onDark?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - clamped / 100);
  const text = label ?? String(Math.round(clamped));
  const fontSize = size * (text.length >= 4 ? 0.18 : 0.24);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={onDark ? "rgba(255,255,255,0.18)" : colors.alabaster}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={scoreColor(clamped)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          fill="none"
        />
      </Svg>
      <Text
        style={{
          position: "absolute",
          fontFamily: fonts.bodyBold,
          fontSize,
          color: onDark ? colors.snow : colors.hunter,
        }}>
        {text}
      </Text>
    </View>
  );
}

export function InfoPanel({
  children,
  tone = "cream",
  style,
}: {
  children: React.ReactNode;
  tone?: "cream" | "white" | "translucent";
  style?: StyleProp<ViewStyle>;
}) {
  const background =
    tone === "white" ? colors.snow : tone === "translucent" ? overlays.whiteOnGreen : overlays.creamSoft;
  return <View style={[styles.infoPanel, { backgroundColor: background }, style]}>{children}</View>;
}

/** Label-over-value tile — the repeated unit in every hero card. */
export function StatTile({
  label,
  value,
  tone = "cream",
  style,
}: {
  label: string;
  value: string;
  tone?: "cream" | "white" | "translucent";
  style?: StyleProp<ViewStyle>;
}) {
  const onDark = tone === "translucent";
  const background =
    tone === "white" ? colors.snow : onDark ? overlays.whiteOnGreen : colors.cream;
  return (
    <View style={[styles.statTile, { backgroundColor: background }, style]}>
      <Text
        style={[
          styles.statValue,
          { color: onDark ? colors.snow : colors.hunter },
        ]}>
        {value}
      </Text>
      <Text
        style={[
          styles.statLabel,
          { color: onDark ? "rgba(248,249,250,0.75)" : colors.sage },
        ]}>
        {label}
      </Text>
    </View>
  );
}

/** A show/hide section — the "Advanced breakdown" pattern from the web app. */
export function Collapsible({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && { opacity: 0.8 }]}>
        <Eyebrow>{title}</Eyebrow>
        {open ? (
          <ChevronUp color={colors.sage} size={18} />
        ) : (
          <ChevronDown color={colors.sage} size={18} />
        )}
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

export function TextField({
  label,
  ...props
}: TextInputProps & { label?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <TextInput
        placeholderTextColor={colors.slate}
        accessibilityLabel={label ?? props.placeholder}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[styles.input, focused && { borderColor: colors.yellowGreen }, props.style]}
      />
    </View>
  );
}

/** A horizontal row of mutually exclusive options. */
export function OptionRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Eyebrow>{label}</Eyebrow> : null}
      <View style={styles.optionRow}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: option.value === value }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              option.value === value && styles.optionSelected,
              pressed && { opacity: 0.85 },
            ]}>
            <Text
              style={[
                styles.optionLabel,
                option.value === value && { color: colors.hunter },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  screenContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: radii.card,
    backgroundColor: colors.snow,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.pill,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pillOutline: {
    borderWidth: 2,
    borderColor: colors.paleSlate,
  },
  pillLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  chipActive: {
    opacity: 0.72,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  progressTrack: {
    height: 10,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.sage,
  },
  segments: {
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: radii.pill,
  },
  infoPanel: {
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  statTile: {
    flex: 1,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
  },
  statLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textAlign: "center",
  },
  collapsible: {
    borderRadius: radii.card,
    backgroundColor: overlays.creamSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 32,
  },
  collapsibleBody: {
    gap: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  input: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.hunter,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  option: {
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: "center",
  },
  optionSelected: {
    backgroundColor: colors.yellowGreen,
  },
  optionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.iron,
  },
});
