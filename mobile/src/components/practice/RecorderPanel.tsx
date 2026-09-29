import * as Haptics from "expo-haptics";
import { Mic, Play, Settings, Square, Trash2, Volume2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecordedAudio } from "@/api/endpoints";
import { getReferenceAudio, prefetchReferenceAudio } from "@/audio/reference-audio";
import { formatElapsed } from "@/audio/take-machine";
import { Banner, Body, InfoPanel, PillButton } from "@/components/ui";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { usePlayback } from "@/hooks/usePlayback";
import { useTakeRecorder } from "@/hooks/useTakeRecorder";
import { colors, fonts, radii, spacing } from "@/theme/theme";

interface RecorderPanelProps {
  /** Text whose TTS rendering "Hear target" plays. Omit to hide the button. */
  targetText?: string;
  /**
   * Handles the finished take. Throw to tell the panel the take failed — the
   * status strip then says so instead of claiming everything is fine.
   */
  onTake: (take: RecordedAudio) => Promise<void> | void;
  /** Blocks recording, e.g. while the scoring engine is still warming up. */
  disabled?: boolean;
  /** Shown in place of the idle copy when `disabled`. */
  disabledReason?: string;
  /** Idle copy when nothing else applies. */
  statusHint?: string;
  /** Freedom mode changes the wording: answer naturally, do not repeat a line. */
  captureMode?: "target" | "freedom";
  /** Prefetches the reference clip on mount so "Hear target" is instant. */
  prefetch?: boolean;
}

export function RecorderPanel({
  targetText,
  onTake,
  disabled = false,
  disabledReason,
  statusHint,
  captureMode = "target",
  prefetch = true,
}: RecorderPanelProps) {
  const recorder = useTakeRecorder();
  const playback = usePlayback();
  const { instruct } = useCoachVoice();

  const [take, setTake] = useState<RecordedAudio | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);

  // The web app flips its copy from "take" to "reply" once the target is a
  // phrase rather than a single word.
  const isPhrase = captureMode === "freedom" || (targetText ?? "").trim().split(/\s+/).length > 2;
  const noun = isPhrase ? "reply" : "take";

  useEffect(() => {
    if (prefetch && targetText) prefetchReferenceAudio(targetText, instruct);
  }, [prefetch, targetText, instruct]);

  // NOTE: callers pass `key={<target id>}` so a new word remounts the panel
  // and clears the previous take. That is deliberate — resetting state from an
  // effect here would render one frame of the old take against the new word.

  const handlePress = useCallback(async () => {
    if (recorder.isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const finished = await recorder.toggle();
      if (!finished) return;
      setTake(finished);
      try {
        await onTake(finished);
        recorder.settle();
      } catch (cause) {
        recorder.settle(
          cause instanceof Error ? cause.message : "That take could not be scored. Try again.",
        );
      }
      return;
    }

    playback.stop();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTake(null);
    setTtsError(null);
    await recorder.toggle();
  }, [onTake, playback, recorder]);

  async function hearTarget() {
    if (!targetText) return;
    if (playback.isPlaying || playback.isLoading) {
      playback.stop();
      return;
    }
    setTtsError(null);
    setTtsLoading(true);
    try {
      const uri = await getReferenceAudio(targetText, instruct);
      await playback.play(uri);
    } catch (cause) {
      setTtsError(
        cause instanceof Error
          ? cause.message
          : "Could not load the reference audio. Check your connection.",
      );
    } finally {
      setTtsLoading(false);
    }
  }

  const hint = recorder.hint({
    fallback: disabled
      ? (disabledReason ?? "Recording unlocks by itself as soon as that clears.")
      : (statusHint ??
        (captureMode === "freedom"
          ? "Tap the microphone and answer in your own words."
          : "Tap the microphone and read the target out loud.")),
    hasTake: take !== null,
  });

  const recording = recorder.isRecording;
  const buttonDisabled = disabled || recorder.busy;
  // The halo tracks the live input level, so the learner can see it hears them.
  const haloScale = 1 + recorder.level * 0.45;

  return (
    <View style={styles.container}>
      {ttsError ? <Banner message={ttsError} tone="error" /> : null}

      <View style={styles.buttonWrap}>
        {recording ? (
          <View pointerEvents="none" style={[styles.halo, { transform: [{ scale: haloScale }] }]} />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? `Stop recording this ${noun}` : `Record a ${noun}`}
          accessibilityState={{ disabled: buttonDisabled, busy: recorder.busy }}
          disabled={buttonDisabled}
          onPress={handlePress}
          style={({ pressed }) => [
            styles.recordButton,
            { backgroundColor: recording ? colors.brick : colors.hunter },
            buttonDisabled && { opacity: 0.5 },
            pressed && { transform: [{ scale: 0.96 }] },
          ]}>
          {recording ? (
            <Square color={colors.snow} size={28} fill={colors.snow} />
          ) : (
            <Mic color={colors.snow} size={30} />
          )}
        </Pressable>
      </View>

      {recording ? <Text style={styles.timer}>{formatElapsed(recorder.elapsedMs)}</Text> : null}

      <View style={styles.actionsRow}>
        {targetText ? (
          <PillButton
            label={playback.isPlaying ? "Stop target" : "Hear target"}
            variant="secondary"
            loading={ttsLoading}
            disabled={recording}
            icon={<Volume2 color={colors.hunter} size={16} />}
            onPress={hearTarget}
          />
        ) : null}
        {take ? (
          <>
            <PillButton
              label={playback.playingUri === take.uri ? `Stop ${noun}` : `Play my ${noun}`}
              variant="ghost"
              disabled={recording}
              icon={<Play color={colors.hunter} size={16} />}
              onPress={() =>
                playback.playingUri === take.uri ? playback.stop() : playback.play(take.uri)
              }
            />
            <PillButton
              label={`Clear ${noun}`}
              variant="ghost"
              disabled={recording}
              icon={<Trash2 color={colors.hunter} size={16} />}
              onPress={() => {
                playback.stop();
                setTake(null);
                recorder.reset();
              }}
            />
          </>
        ) : null}
      </View>

      <InfoPanel style={styles.status}>
        <Body
          size={13}
          weight={hint.tone === "neutral" ? "regular" : "semibold"}
          style={[styles.statusText, hint.tone === "error" && { color: colors.brick }]}>
          {hint.text}
        </Body>
        {hint.showSettingsLink ? (
          <PillButton
            label="Open Settings"
            variant="primary"
            icon={<Settings color={colors.snow} size={16} />}
            onPress={recorder.openSettings}
            style={styles.settingsButton}
          />
        ) : null}
      </InfoPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: spacing.md,
  },
  buttonWrap: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: "rgba(188,71,73,0.22)",
  },
  recordButton: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.brick,
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  status: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  statusText: {
    textAlign: "center",
  },
  settingsButton: {
    marginTop: spacing.xs,
    alignSelf: "stretch",
  },
});
