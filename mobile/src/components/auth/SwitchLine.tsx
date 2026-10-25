// FILE: mobile/src/components/auth/SwitchLine.tsx
//
// The line at the foot of the sign-in and sign-up screens that swaps one for
// the other ("New to Cadence? Create an account").
import { StyleSheet, View } from "react-native";

import { Body, TextLink } from "@/components/ui";
import { spacing, type } from "@/theme/theme";

export function SwitchLine({ prompt, label, onPress }: { prompt: string; label: string; onPress: () => void }) {
  return (
    <View style={styles.row}>
      <Body size={type.callout} tone="muted">
        {prompt}
      </Body>
      <TextLink label={label} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: spacing.sm },
});
