// Update notices from GET /api/version: a soft banner when a newer build is
// out, and a blocking screen only when this build is below the minimum the
// server still supports.
import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { getVersionInfo } from "@/api/account";
import { Banner, Body, Button, Title } from "@/components/ui";
import { parseVersionInfo, updateNotice, type UpdateNotice } from "@/lib/version-check";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

const BUILD = Number.parseInt(Application.nativeBuildVersion ?? "", 10);
const INSTALLED = { version: Application.nativeApplicationVersion ?? null, build: Number.isFinite(BUILD) ? BUILD : null };

/** Checked on launch and on return to the foreground, at most once an hour. */
export function useUpdateNotice(): UpdateNotice {
  const query = useQuery({
    queryKey: ["app-version"],
    queryFn: getVersionInfo,
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  if (!query.data) return { kind: "none" };
  return updateNotice(parseVersionInfo(query.data), INSTALLED);
}

let dismissed = false;

export function UpdateBanner() {
  const notice = useUpdateNotice();
  const [hidden, setHidden] = useState(dismissed);
  if (notice.kind !== "available" || hidden) return null;
  return (
    <Banner
      tone="info"
      message={`Update available: Cadence ${notice.version}.`}
      actionLabel="Update"
      onAction={() => {
        void Linking.openURL(notice.storeUrl);
        dismissed = true;
        setHidden(true);
      }}
    />
  );
}

/** Replaces the app when this build is too old to work with the server. */
export function UpdateGate({ children }: { children: React.ReactNode }) {
  const notice = useUpdateNotice();
  if (notice.kind !== "required") return <>{children}</>;
  return (
    <View style={styles.screen}>
      <View style={styles.card} accessibilityRole="alert">
        <Title size={type.title2}>Update Cadence to keep practising</Title>
        <Body size={type.callout}>This version no longer works with Cadence. The update is free.</Body>
        <Button label="Open the App Store" onPress={() => void Linking.openURL(notice.storeUrl)} />
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.cream, justifyContent: "center", padding: spacing.lg },
    card: { borderRadius: radii.cardLarge, backgroundColor: colors.snow, padding: spacing.xl, gap: spacing.md, boxShadow: shadows.card },
  }),
);
