import { StyleSheet, View } from "react-native";

import { Body, Title } from "@/components/ui";
import { spacing, type } from "@/theme/theme";

/** The question a step asks, with at most one short line under it. */
export function StepHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.root}>
      <Title size={type.title1}>{title}</Title>
      {detail ? (
        <Body size={type.body} tone="muted">
          {detail}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
});
