import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  Body,
  Card,
  Chip,
  Eyebrow,
  ProgressRing,
  StatRow,
  StatTile,
  Title,
  type ChipStatus,
} from "@/components/ui";
import { ILLUSTRATION_SUCCESS } from "@/data/svg";
import { spacing, type } from "@/theme/theme";

export interface SummaryItem {
  label: string;
  status: ChipStatus;
}

/**
 * The end of every round, lesson, scenario and coach session: a ring, a
 * headline, a line of context, up to three numbers, the items that came up,
 * and the ways out (passed as children, usually an `ActionRow`).
 */
export function ResultSummary({
  eyebrow,
  score,
  ringLabel,
  title,
  subtitle,
  stats,
  items,
  badge,
  celebrate = false,
  children,
}: {
  eyebrow: string;
  /** 0-100; drives the ring. */
  score: number;
  /** Shown inside the ring instead of the bare number, e.g. "80%". */
  ringLabel?: string;
  title: string;
  subtitle?: string;
  stats: { label: string; value: string }[];
  items?: SummaryItem[];
  /** A short highlight under the title, e.g. "New best score". */
  badge?: string;
  /** Shows the success illustration. */
  celebrate?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card style={styles.card}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <ProgressRing score={score} size={104} strokeWidth={9} label={ringLabel} />
      <View style={styles.headline}>
        <Title size={type.title2} style={styles.center}>
          {title}
        </Title>
        {badge ? <Chip label={badge} status="correct" /> : null}
        {subtitle ? (
          <Body size={type.footnote} tone="muted" style={styles.center}>
            {subtitle}
          </Body>
        ) : null}
      </View>

      <View style={styles.stretch}>
        <StatRow>
          {stats.map((stat) => (
            <StatTile key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </StatRow>
      </View>

      {items && items.length > 0 ? (
        <View style={styles.chips}>
          {items.map((item, index) => (
            <Chip key={`${item.label}-${index}`} label={item.label} status={item.status} />
          ))}
        </View>
      ) : null}

      {celebrate ? <SvgXml xml={ILLUSTRATION_SUCCESS} width={128} height={128} /> : null}

      {children ? <View style={styles.stretch}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: spacing.lg,
  },
  headline: {
    alignItems: "center",
    gap: spacing.sm,
  },
  center: {
    textAlign: "center",
  },
  stretch: {
    alignSelf: "stretch",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
});
