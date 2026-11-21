// One email category's switch in Settings › Email: getting-started tips,
// practice reminders, or product news and offers. Each is on unless the
// learner turned it off (src/platform/email-consent.ts); tips and reminders
// are saved on the account (PATCH /api/me), news and offers also update the
// mailing list (POST /api/newsletter). Cloud accounts only.
import { useState } from "react";
import { StyleSheet, Switch, View } from "react-native";

import { setEmailPref, setNewsletter } from "@/api/account";
import { ApiError } from "@/api/client";
import { Banner, Body, Title } from "@/components/ui";
import { useAccount } from "@/context/account";
import { EMAIL_PREF_LABELS, type EmailPrefKey } from "@/platform/email-consent";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

export function EmailPrefToggle({ pref }: { pref: EmailPrefKey }) {
  const account = useAccount();
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = value ?? account.me?.emailPrefs[pref] ?? true;
  const label = EMAIL_PREF_LABELS[pref];

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    setValue(next);
    try {
      await (pref === "newsletter" ? setNewsletter(next) : setEmailPref(pref, next));
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
        <Title size={type.headline}>{label.title}</Title>
        <Body size={type.footnote} tone="muted">
          {label.detail}
        </Body>
        {error ? <Banner tone="error" message={error} /> : null}
      </View>
      <Switch accessibilityLabel={label.title} value={on} disabled={busy} onValueChange={(next) => void change(next)} trackColor={{ true: colors.sage, false: colors.paleSlate }} />
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
