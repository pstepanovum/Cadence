// Offline content packs: what is on the phone (with sizes), what can be
// downloaded or updated, and a remove button for downloaded ones. Packs come
// from the hosted site, or from your own Cadence server when there is no cloud.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Banner, Body, Button, Card, Eyebrow, LoadingBlock, Screen, Title, TopBar } from "@/components/ui";
import { availableUpdates, downloadPack, isBundled, removeDownloadedPack, type AvailablePack } from "@/content/packs";
import { useInstalledPacks } from "@/content/useContent";
import { config } from "@/lib/config";
import { useConnection } from "@/pairing/context";
import { spacing, type } from "@/theme/theme";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PacksScreen() {
  const { mode, baseUrl } = useConnection();
  const source = mode === "cloud" ? config.apiUrl : baseUrl;
  const installed = useInstalledPacks();
  const queryClient = useQueryClient();
  const updates = useQuery({
    queryKey: ["packs", "available", source],
    queryFn: () => availableUpdates(source!),
    enabled: Boolean(source),
    retry: false,
  });
  const [progress, setProgress] = useState<{ id: string; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ["packs"] });
    await queryClient.invalidateQueries({ queryKey: ["pack"] });
  }

  async function get(pack: AvailablePack) {
    if (!source) return;
    setError(null);
    setProgress({ id: pack.id, done: 0, total: 1 });
    try {
      await downloadPack(source, pack, (done, total) => setProgress({ id: pack.id, done, total }));
      await refreshAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The download didn't finish. Try again.");
    } finally {
      setProgress(null);
    }
  }

  async function remove(id: string) {
    await removeDownloadedPack(id);
    await refreshAll();
  }

  const label = (id: string, level: string | null) => (level ? `Level ${level}` : id === "sounds" ? "Sounds library" : id);

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Settings" title="Offline content packs" />
      <Body size={type.callout} tone="muted">
        Lessons, practice and sounds work offline from these packs.
      </Body>
      {error ? <Banner tone="error" message={error} /> : null}

      <View style={styles.section}>
        <Eyebrow>On this phone</Eyebrow>
        {installed.isLoading ? (
          <LoadingBlock rows={2} />
        ) : (
          (installed.data ?? []).map((pack) => (
            <Card key={pack.id} style={styles.row}>
              <View style={styles.flex}>
                <Title size={type.headline}>{label(pack.id, pack.level)}</Title>
                <Body size={type.footnote} tone="muted">{`${formatBytes(pack.bytes)} · version ${pack.version}${pack.origin === "bundled" ? " · built in" : ""}`}</Body>
              </View>
              {pack.origin === "downloaded" ? (
                <Button label={isBundled(pack.id) ? "Use built-in" : "Remove"} variant="neutral" onPress={() => void remove(pack.id)} />
              ) : null}
            </Card>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Eyebrow>Available</Eyebrow>
        {!source ? (
          <Body size={type.callout}>Connect to Cadence to see more packs.</Body>
        ) : updates.isLoading ? (
          <LoadingBlock rows={1} label="Checking for packs…" />
        ) : updates.isError ? (
          <Banner tone="warning" message="Couldn't check for packs. You're probably offline." actionLabel="Try again" onAction={() => void updates.refetch()} />
        ) : (updates.data ?? []).length === 0 ? (
          <Body size={type.callout}>Everything is up to date.</Body>
        ) : (
          (updates.data ?? []).map((pack) => {
            const busy = progress?.id === pack.id;
            return (
              <Card key={pack.id} style={styles.row}>
                <View style={styles.flex}>
                  <Title size={type.headline}>{label(pack.id, pack.level)}</Title>
                  <Body size={type.footnote} tone="muted">
                    {busy ? `Downloading ${progress!.done} of ${progress!.total}…` : `${formatBytes(pack.bytes)} · version ${pack.version}`}
                  </Body>
                </View>
                <Button label="Download" loading={busy} disabled={progress !== null} onPress={() => void get(pack)} />
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1, gap: spacing.xxs },
});
