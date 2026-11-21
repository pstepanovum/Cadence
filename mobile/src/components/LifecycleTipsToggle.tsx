// "Getting-started tips": a few emails in the first two weeks, on unless the
// learner turns them off (PATCH /api/me). Cloud accounts without Plus only;
// the sequence stops by itself once Plus is on.
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { setLifecycleTips } from "@/api/account";
import { ApiError } from "@/api/client";
import { Banner, Body, Title } from "@/components/ui";
import { useAccount } from "@/context/account";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

export function LifecycleTipsToggle() {
  const account = useAccount();
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = value ?? account.me?.lifecycleTips ?? true;

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    setValue(next);
    try {
      await setLifecycleTips(next);
      account.refresh();
    } catch (cause) {
      setValue(!next);
      setError(cause instanceof ApiError && cause.status !== 401 && cause.status < 500 ? cause.message : "That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Title size={type.headline}>Getting-started tips</Title>
        <Body size={type.footnote} tone="muted">
          A few short emails in your first two weeks.
        </Body>
        {error ? <Banner tone="error" message={error} /> : null}
      </View>
      <Switch
        accessibilityLabel="Getting-started tips"
        value={on}
        disabled={busy}
        onValueChange={(next) => void change(next)}
        trackColor={{ true: colors.sage, false: colors.paleSlate }}
      />
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
      boxShadow: shadows.card,
    },
    text: { flex: 1, gap: spacing.xxs },
  }),
);
