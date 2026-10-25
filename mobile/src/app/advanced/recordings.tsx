// Your recordings: every take kept on this phone, by item or by date, to
// play, hear against the target, share or save to Files, or delete. Optional
// copy in your own iCloud Drive. Nothing is uploaded to Cadence.
import { router } from "expo-router";
import { Play, Share2, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";

import { Body, Card, Chip, EmptyState, HorizontalPicker, LoadingBlock, Screen, Title, TopBar } from "@/components/ui";
import { usePlayback } from "@/hooks/usePlayback";
import { today } from "@/learning/store";
import { useTarget } from "@/learning/useTarget";
import { formatBytes, formatDuration, groupByDay, groupByItem, RECORDING_KIND_LABELS, totals, type Recording } from "@/platform/recordings";
import { dayKey } from "@/platform/srs";
import { ICLOUD_REASON_COPY, icloudEnabled, icloudStatus, setICloudEnabled, type ICloudStatus } from "@/recordings/icloud";
import { copyPendingToICloud, deleteTakes, exportTake, fileFor, useRecordingIndex } from "@/recordings/store";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

export default function RecordingsScreen() {
  const index = useRecordingIndex();
  const playback = usePlayback();
  const target = useTarget();
  const [view, setView] = useState<"item" | "day">("item");
  const [status, setStatus] = useState<ICloudStatus | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void icloudStatus().then(setStatus);
    void icloudEnabled().then(setEnabled);
  }, []);

  const groups = useMemo(() => (index ? (view === "item" ? groupByItem(index).map((g) => ({ key: g.itemId, title: g.text, label: RECORDING_KIND_LABELS[g.kind], takes: g.takes })) : groupByDay(index, (ms) => dayKey(new Date(ms))).map((g) => ({ key: g.day, title: new Date(`${g.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }), label: null, takes: g.takes }))) : []), [index, view]);

  const play = (take: Recording) => void playback.play(fileFor(take).uri);
  const ab = async (take: Recording) => {
    await target.play({ text: take.text });
    void playback.play(fileFor(take).uri);
  };
  const confirmDelete = (take: Recording) =>
    Alert.alert("Delete this take?", "It is removed from this phone" + (take.icloud === "copied" ? " and from iCloud Drive." : "."), [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteTakes([take.id]) },
    ]);

  return (
    <Screen>
      <TopBar eyebrow="Recordings" title="Your own voice, kept for comparison" onBack={() => router.back()} />
      {!index ? (
        <LoadingBlock rows={3} label="Opening your recordings…" />
      ) : (
        <>
          <Body size={type.footnote} tone="muted">
            {(() => {
              const t = totals(index);
              return t.takes ? `${t.takes} take${t.takes === 1 ? "" : "s"} of ${t.items} item${t.items === 1 ? "" : "s"} · ${formatDuration(t.durationMs)} · ${formatBytes(t.bytes)} on this phone. Never uploaded to Cadence.` : "Takes stay on this phone and are never uploaded to Cadence.";
            })()}
          </Body>
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Title size={type.headline}>Copy to iCloud Drive</Title>
                <Body size={type.footnote} tone="muted">
                  {status?.available === false ? ICLOUD_REASON_COPY[status.reason] : "A copy of each take in a Cadence folder in your own iCloud Drive, visible in the Files app."}
                </Body>
              </View>
              <Switch
                accessibilityLabel="Copy recordings to iCloud Drive"
                value={enabled && status?.available === true}
                disabled={status?.available !== true}
                trackColor={{ true: colors.hunter, false: colors.alabaster }}
                onValueChange={(next) => {
                  setEnabled(next);
                  void setICloudEnabled(next).then(() => (next ? copyPendingToICloud() : 0));
                }}
              />
            </View>
          </Card>
          {index.items.length === 0 ? (
            <EmptyState title="No recordings yet" message="Record yourself on any phrase, slang example or plateau drill and the take appears here." />
          ) : (
            <>
              <HorizontalPicker selectedIndex={view === "item" ? 0 : 1}>
                {[<Chip key="item" label="By item" selected={view === "item"} onPress={() => setView("item")} />, <Chip key="day" label="By date" selected={view === "day"} onPress={() => setView("day")} />]}
              </HorizontalPicker>
              {groups.map((group) => (
                <Card key={group.key} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Body weight="semibold" style={styles.flex}>
                      {group.title}
                    </Body>
                    {group.label ? <Body size={type.caption} tone="muted">{group.label}</Body> : null}
                  </View>
                  {group.takes.map((take) => (
                    <View key={take.id} style={styles.take}>
                      <View style={styles.flex}>
                        {view === "day" ? (
                          <Body size={type.footnote} numberOfLines={2}>
                            {take.text}
                          </Body>
                        ) : null}
                        <Body size={type.caption} tone="muted">
                          {`${new Date(take.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${formatDuration(take.durationMs)}${take.icloud === "copied" ? " · in iCloud" : ""}`}
                        </Body>
                      </View>
                      <IconButton label="Play your take" onPress={() => play(take)}>
                        <Play color={colors.carbon} size={16} />
                      </IconButton>
                      <IconButton label="Hear the target, then your take" onPress={() => void ab(take)}>
                        <Body size={type.caption} weight="semibold">
                          A/B
                        </Body>
                      </IconButton>
                      <IconButton label="Share or save to Files" onPress={() => void exportTake(take, today())}>
                        <Share2 color={colors.carbon} size={16} />
                      </IconButton>
                      <IconButton label="Delete" onPress={() => confirmDelete(take)}>
                        <Trash2 color={colors.carbon} size={16} />
                      </IconButton>
                    </View>
                  ))}
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { gap: spacing.sm },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    flex: { flex: 1 },
    take: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
    icon: { minWidth: 40, minHeight: 40, borderRadius: radii.control, backgroundColor: colors.platinum, alignItems: "center", justifyContent: "center" },
    pressed: { opacity: 0.7 },
  }),
);
