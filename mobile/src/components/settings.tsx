// Rows for Settings and Profile: one that opens a screen, one with a switch.
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Switch, View } from "react-native";

import { Body, pressedCard, Title } from "@/components/ui";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

export function SettingsRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressedCard(pressed)]}>
      <View style={styles.icon}>{icon}</View>
      <View style={styles.body}>
        <Title size={type.headline}>{title}</Title>
        <Body size={type.footnote} tone="muted" numberOfLines={3}>
          {detail}
        </Body>
      </View>
      <ChevronRight color={colors.slate} size={20} />
    </Pressable>
  );
}

export function SwitchRow({
  title,
  detail,
  value,
  onChange,
  disabled,
  children,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Shown under the row while it is on (a time, say). */
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.switchCard}>
      <View style={styles.switchRow}>
        <View style={styles.body}>
          <Title size={type.headline}>{title}</Title>
          {detail ? (
            <Body size={type.footnote} tone="muted">
              {detail}
            </Body>
          ) : null}
        </View>
        <Switch
          accessibilityLabel={title}
          accessibilityHint={detail}
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ true: colors.sage, false: colors.paleSlate }}
        />
      </View>
      {value && children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.lg,
      minHeight: 72,
      boxShadow: shadows.card,
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: radii.panel,
      backgroundColor: colors.cream,
      alignItems: "center",
      justifyContent: "center",
    },
    body: { flex: 1, gap: spacing.xxs },
    switchCard: { borderRadius: radii.card, backgroundColor: colors.snow, padding: spacing.lg, gap: spacing.md, boxShadow: shadows.card },
    switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    extra: { gap: spacing.md },
  }),
);
