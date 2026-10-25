import { StyleSheet, View } from "react-native";

import { Body, Title } from "@/components/ui";
import { colors, spacing, type } from "@/theme/theme";

/** The question a step asks, with at most one short line under it. Smaller on short phones. */
export function StepHeading({ title, detail, compact = false }: { title: string; detail?: string; compact?: boolean }) {
  return (
    <View style={styles.root}>
      <Title size={compact ? type.title2 : type.title1} style={{ color: colors.carbon }}>{title}</Title>
      {detail ? (
        <Body size={compact ? type.callout : type.body} tone="muted">
          {detail}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
});
