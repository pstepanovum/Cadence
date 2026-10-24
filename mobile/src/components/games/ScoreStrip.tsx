import { Flame, Heart } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radii, spacing } from "@/theme/theme";

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
        <Text style={styles.scoreLabel}>Score</Text>
        <Text style={styles.scoreValue}>{score}</Text>
      </View>

      {streak !== undefined ? (
        <View
          style={[styles.pill, hot && styles.hotPill]}
          accessibilityLabel={`${streak} in a row`}>
          <Flame color={hot ? colors.hunter : colors.slate} size={14} />
          <Text style={[styles.pillText, hot && { color: colors.hunter }]}>×{streak}</Text>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.snow,
    paddingHorizontal: 12,
    minHeight: 34,
  },
  scorePill: {
    backgroundColor: colors.hunter,
    gap: 6,
  },
  scoreLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "rgba(248,249,250,0.75)",
  },
  scoreValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.snow,
  },
  hotPill: {
    backgroundColor: colors.yellowGreen,
  },
  pillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.slate,
  },
  hearts: {
    flexDirection: "row",
    gap: 2,
    marginLeft: "auto",
  },
});
