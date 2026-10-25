// Record yourself on any sentence, keep the take, and hear it next to the
// target: Target, You, or both back to back (A/B). Takes go to the phone's
// documents directory (store.ts) and are never uploaded.
import { Mic, Pause, Play, Repeat2, Square } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body } from "@/components/ui";
import { usePlayback } from "@/hooks/usePlayback";
import { useTakeRecorder } from "@/hooks/useTakeRecorder";
import { haptics } from "@/lib/haptics";
import { useTarget, type TargetSource } from "@/learning/useTarget";
import { formatDuration, takesFor } from "@/platform/recordings";
import { colors, fonts, maxScale, radii, spacing, type, themed } from "@/theme/theme";

import { fileFor, saveTake, useRecordingIndex } from "./store";

function Pill({ label, icon, onPress, primary, danger, disabled }: { label: string; icon: React.ReactNode; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.pill, primary && styles.pillPrimary, danger && styles.pillDanger, disabled && styles.pillDisabled, pressed && styles.pillPressed]}>
      {icon}
      <Text maxFontSizeMultiplier={maxScale.control} style={[styles.pillLabel, (primary || danger) && styles.pillLabelOnColor]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RecordCompare({ itemId, target, compact = false }: { itemId: string; target: TargetSource; compact?: boolean }) {
  const recorder = useTakeRecorder();
  const playback = usePlayback();
  const targetAudio = useTarget();
  const index = useRecordingIndex();
  const takes = useMemo(() => (index ? takesFor(index, itemId) : []), [index, itemId]);
  const latest = takes[0];
  const [mode, setMode] = useState<"idle" | "target" | "you" | "ab">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => targetAudio.stop(), [targetAudio]);

  const stopAll = () => {
    targetAudio.stop();
    playback.stop();
    setMode("idle");
  };

  const playYou = () =>
    new Promise<void>((resolve) => {
      if (!latest) return resolve();
      void playback.play(fileFor(latest).uri, resolve).catch(() => resolve());
    });

  async function run(next: "target" | "you" | "ab") {
    if (mode !== "idle") return stopAll();
    setMode(next);
    try {
      if (next !== "you") await targetAudio.play(target);
      if (next !== "target") await playYou();
    } finally {
      setMode("idle");
    }
  }

  async function record() {
    setError(null);
    stopAll();
    const wasRecording = recorder.isRecording;
    const durationMs = recorder.elapsedMs;
    const audio = await recorder.toggle(itemId.replace(/[^a-z0-9]+/gi, "-").slice(0, 40));
    if (!wasRecording || !audio) return;
    try {
      await saveTake({ uri: audio.uri, mime: audio.type, itemId, text: target.text, durationMs: Math.max(durationMs, recorder.elapsedMs) });
      recorder.settle();
    } catch {
      recorder.settle("The take couldn't be saved. Check the phone has free space.");
      setError("The take couldn't be saved. Check the phone has free space.");
    }
  }

  const hint = recorder.hint({ fallback: compact ? "" : "Record yourself, then compare." });

  return (
    <View style={[styles.wrap, !compact && styles.panel]}>
      <View style={styles.row}>
        <Pill label="Target" icon={mode === "target" ? <Pause color={colors.carbon} size={16} /> : <Play color={colors.carbon} size={16} />} onPress={() => void run("target")} disabled={recorder.isRecording} />
        <Pill
          label={recorder.isRecording ? `Stop ${formatDuration(recorder.elapsedMs)}` : "Record"}
          icon={recorder.isRecording ? <Square color={colors.snow} size={16} /> : <Mic color={colors.snow} size={16} />}
          primary={!recorder.isRecording}
          danger={recorder.isRecording}
          disabled={recorder.busy && !recorder.isRecording}
          onPress={() => void record()}
        />
        {latest ? (
          <>
            <Pill label="You" icon={mode === "you" ? <Pause color={colors.carbon} size={16} /> : <Play color={colors.carbon} size={16} />} onPress={() => void run("you")} disabled={recorder.isRecording} />
            <Pill label="A/B" icon={<Repeat2 color={colors.carbon} size={16} />} onPress={() => void run("ab")} disabled={recorder.isRecording} />
          </>
        ) : null}
      </View>
      {error ? (
        <Body size={type.footnote} tone="muted">
          {error}
        </Body>
      ) : hint.text && (recorder.state.status === "denied" || recorder.state.status === "error" || !compact) ? (
        <Body size={type.footnote} tone="muted">
          {recorder.state.status === "denied" ? "The microphone is off for Cadence. Turn it on in Settings to record." : latest && recorder.state.status === "idle" ? `${takes.length} take${takes.length === 1 ? "" : "s"} kept · latest ${formatDuration(latest.durationMs)}` : hint.text}
        </Body>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    panel: { backgroundColor: colors.snow, borderRadius: radii.card, padding: spacing.md },
    row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    pill: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.control, backgroundColor: colors.platinum },
    pillPrimary: { backgroundColor: colors.hunter },
    pillDanger: { backgroundColor: colors.brick },
    pillDisabled: { opacity: 0.5 },
    pillPressed: { opacity: 0.8 },
    pillLabel: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.carbon },
    pillLabelOnColor: { color: colors.snow },
  }),
);
