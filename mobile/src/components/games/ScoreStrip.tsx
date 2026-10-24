import { Flame, Heart } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, maxScale, radii, spacing, type, themed } from "@/theme/theme";

/**
 * Score, combo and lives in one compact row. Lives are drawn as hearts so a
 * lost one is obvious without reading; the streak only lights up once it is
 * worth bonus points.
 */
export function ScoreStrip({
  score,
  streak,
  lives,
  maxLives,
}: {
  score: number;
  streak?: number;
  lives?: number;
  maxLives?: number;
}) {
  const hot = (streak ?? 0) >= 2;
  return (
    <View style={styles.row} accessibilityRole="summary">
      <View style={[styles.pill, styles.scorePill]}>
        <Text maxFontSizeMultiplier={maxScale.label} style={styles.scoreLabel}>
          Score
        </Text>
        <Text maxFontSizeMultiplier={maxScale.label} style={styles.scoreValue}>
          {score}
        </Text>
      </View>

      {streak !== undefined ? (
        <View
          style={[styles.pill, hot && styles.hotPill]}
          accessibilityLabel={`${streak} in a row`}>
          <Flame color={hot ? colors.ink : colors.slate} size={14} />
          <Text maxFontSizeMultiplier={maxScale.label} style={[styles.pillText, hot && styles.hotText]}>
            ×{streak}
          </Text>
        </View>
      ) : null}

      {lives !== undefined && maxLives !== undefined ? (
        <View style={styles.hearts} accessibilityLabel={`${lives} of ${maxLives} lives left`}>
          {Array.from({ length: maxLives }, (_, index) => (
            <Heart
              key={index}
              size={18}
              color={index < lives ? colors.brick : colors.paleSlate}
              fill={index < lives ? colors.brick : "transparent"}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.white,
      paddingHorizontal: spacing.md,
      minHeight: 32,
    },
    scorePill: {
      backgroundColor: colors.hunter,
    },
    scoreLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: type.caption,
      color: colors.onDarkMuted,
    },
    scoreValue: {
      fontFamily: fonts.bodyBold,
      fontSize: type.body,
      color: colors.snow,
      fontVariant: ["tabular-nums"],
    },
    hotPill: {
      backgroundColor: colors.yellowGreen,
    },
    pillText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.footnote,
      color: colors.slate,
    },
    hotText: {
      color: colors.ink,
    },
    hearts: {
      flexDirection: "row",
      gap: spacing.xxs,
      marginLeft: "auto",
    },
  }),
);
