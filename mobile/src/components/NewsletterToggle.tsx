// "Product news and offers": off unless the learner turns it on
// (POST /api/newsletter). Cloud accounts only.
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { setNewsletter } from "@/api/account";
import { ApiError } from "@/api/client";
import { Banner, Body, Title } from "@/components/ui";
import { useAccount } from "@/context/account";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

export function NewsletterToggle() {
  const account = useAccount();
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const subscribed = value ?? account.me?.newsletter ?? false;

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    setNote(null);
    setValue(next);
    try {
      const result = (await setNewsletter(next)) as { pending?: unknown } | null;
      // Turning it on starts a double opt-in: nothing is sent until the email link is clicked.
      if (next && result?.pending === true) setNote("Check your inbox and tap the link to confirm.");
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
        <Title size={type.headline}>Product news and offers</Title>
        <Body size={type.footnote} tone="muted">
          An occasional email. Off unless you turn it on.
        </Body>
        {note ? (
          <Body size={type.footnote} tone="muted">
            {note}
          </Body>
        ) : null}
        {error ? <Banner tone="error" message={error} /> : null}
      </View>
      <Switch
        accessibilityLabel="Product news and offers"
        value={subscribed}
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
