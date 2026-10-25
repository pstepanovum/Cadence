import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

export function Title({
  children,
  onDark = false,
  size = type.title3,
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
      accessibilityRole="header"
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxScale.title}
      style={[
        {
          fontFamily: fonts.kicker,
          fontSize: size,
          lineHeight: Math.round(size * 1.25),
          color: onDark ? colors.snow : colors.hunter,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

const bodyFamilies = {
  regular: fonts.body,
  medium: fonts.bodyMedium,
  semibold: fonts.bodySemiBold,
  bold: fonts.bodyBold,
} as const;

export function Body({
  children,
  onDark = false,
  size = type.body,
  weight = "regular",
  tone,
  style,
  numberOfLines,
  maxFontSizeMultiplier = maxScale.body,
}: {
  children: React.ReactNode;
  onDark?: boolean;
  size?: number;
  weight?: keyof typeof bodyFamilies;
  /** "muted" for secondary lines; always a colour that passes AA on its surface. */
  tone?: "default" | "muted" | "strong" | "error";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
}) {
  const color = onDark
    ? tone === "muted"
      ? colors.onDarkMuted
      : colors.snow
    : tone === "muted"
      ? colors.slate
      : tone === "strong"
        ? colors.hunter
        : tone === "error"
          ? colors.brickText
          : colors.iron;
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        {
          fontFamily: bodyFamilies[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.45),
          color,
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
      maxFontSizeMultiplier={maxScale.label}
      style={[
        styles.eyebrow,
        { color: tone ?? (onDark ? colors.lime : colors.sageText) },
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
  size = type.title1,
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
          <Body size={type.callout} tone="muted" onDark={onDark}>
            {subtitle}
          </Body>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/** An inline text link with a full-height tap target. */
export function TextLink({
  label,
  href,
  onPress,
}: {
  label: string;
  href?: Href;
  onPress?: () => void;
}) {
  const pressable = (
    <Pressable
      accessibilityRole="link"
      // With an href, expo-router's Link composes its own press after this one.
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      hitSlop={{ left: spacing.sm, right: spacing.sm }}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}>
      <Text maxFontSizeMultiplier={maxScale.control} style={styles.linkLabel}>
        {label}
      </Text>
    </Pressable>
  );
  if (!href) return pressable;
  return (
    <Link href={href} asChild>
      {pressable}
    </Link>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    eyebrow: {
      fontFamily: fonts.kicker,
      fontSize: type.caption,
      lineHeight: 16,
      letterSpacing: 1,
      textTransform: "uppercase",
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
    link: {
      minHeight: TAP_TARGET,
      justifyContent: "center",
      alignSelf: "center",
    },
    linkPressed: {
      opacity: 0.6,
    },
    linkLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.callout,
      color: colors.hunter,
      textDecorationLine: "underline",
      textDecorationColor: colors.yellowGreen,
    },
  }),
);
