import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Body, Card, Chip, Eyebrow, PillButton, ProgressRing, StatTile, Title, type ChipStatus } from "@/components/ui";
import { ILLUSTRATION_SUCCESS } from "@/data/svg";
import { roundVerdict } from "@/games/quiz";
import { spacing } from "@/theme/theme";

export interface SummaryItem {
  label: string;
  status: ChipStatus;
}

/**
 * The end of every round: a ring for accuracy, a headline, three numbers, the
 * words that came up, and two ways out. Mirrors the lesson summary so a
 * finished game feels like a finished lesson.
 */
export function RoundSummary({
  eyebrow = "Round complete",
  accuracy,
  subtitle,
  stats,
  items,
  isNewBest = false,
  onPlayAgain,
  onDone,
  playAgainLabel = "Play again",
}: {
  eyebrow?: string;
  /** 0-100; drives the ring and the headline. */
  accuracy: number;
  subtitle?: string;
  stats: { label: string; value: string }[];
  items?: SummaryItem[];
  isNewBest?: boolean;
  onPlayAgain: () => void;
  onDone: () => void;
  playAgainLabel?: string;
}) {
  const verdict = roundVerdict(accuracy);

  return (
    <Card style={styles.card}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <ProgressRing score={accuracy} size={104} strokeWidth={9} label={`${accuracy}%`} />
      <Title size={22} style={styles.center}>
        {verdict.title}
      </Title>
      {isNewBest ? <Chip label="New best score" status="correct" /> : null}
      {subtitle ? (
        <Body size={13} style={styles.center}>
          {subtitle}
        </Body>
      ) : null}

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </View>

      {items && items.length > 0 ? (
        <View style={styles.chips}>
          {items.map((item, index) => (
            <Chip key={`${item.label}-${index}`} label={item.label} status={item.status} />
          ))}
        </View>
      ) : null}

      {verdict.passed ? <SvgXml xml={ILLUSTRATION_SUCCESS} width={150} height={150} /> : null}

      <View style={styles.actions}>
        <PillButton label={playAgainLabel} onPress={onPlayAgain} />
        <PillButton label="Back to games" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.lg,
  },
  center: {
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignSelf: "stretch",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.sm,
  },
});
