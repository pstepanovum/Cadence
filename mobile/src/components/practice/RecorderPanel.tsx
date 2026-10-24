import { Mic, Play, Settings, Square, Trash2, Volume2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { RecordedAudio } from "@/api/endpoints";
import { formatElapsed } from "@/audio/take-machine";
import { Body, Button, buttonIconColor, InfoPanel } from "@/components/ui";
import { usePlayback } from "@/hooks/usePlayback";
import { useSpeech } from "@/hooks/useSpeech";
import { useTakeRecorder } from "@/hooks/useTakeRecorder";
import { haptics } from "@/lib/haptics";
import { colors, fonts, overlays, radii, shadows, spacing, type } from "@/theme/theme";

interface RecorderPanelProps {
  /** Text whose TTS rendering "Hear target" plays. Omit to hide the button. */
  targetText?: string;
  /**
   * Handles the finished take. Throw to tell the panel the take failed — the
   * status strip then says so. It is the one place a scoring error is shown.
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
  const speech = useSpeech();
  const { prefetch: warm } = speech;

  const [take, setTake] = useState<RecordedAudio | null>(null);
  const [halo] = useState(() => new Animated.Value(1));

  // The web app flips its copy from "take" to "reply" once the target is a
  // phrase rather than a single word.
  const isPhrase = captureMode === "freedom" || (targetText ?? "").trim().split(/\s+/).length > 2;
  const noun = isPhrase ? "reply" : "take";

  useEffect(() => {
    if (prefetch && targetText) warm(targetText);
  }, [prefetch, targetText, warm]);

  // NOTE: callers pass `key={<target id>}` so a new word remounts the panel
  // and clears the previous take. That is deliberate — resetting state from an
  // effect here would render one frame of the old take against the new word.

  const recording = recorder.isRecording;

  // The halo follows the live input level so the learner can see the phone
  // hears them. The meter updates ten times a second; the spring fills the gaps.
  useEffect(() => {
    Animated.spring(halo, {
      toValue: recording ? 1 + recorder.level * 0.45 : 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }, [halo, recorder.level, recording]);

  const handlePress = useCallback(async () => {
    if (recorder.isRecording) {
      haptics.thud();
      const finished = await recorder.toggle();
      if (!finished) return;
      setTake(finished);
      try {
        await onTake(finished);
        recorder.settle();
      } catch (cause) {
        haptics.error();
        recorder.settle(
          cause instanceof Error ? cause.message : "That take could not be scored. Try again.",
        );
      }
      return;
    }

    playback.stop();
    speech.stop();
    haptics.thud();
    setTake(null);
    await recorder.toggle();
  }, [onTake, playback, recorder, speech]);

  const hint = recorder.hint({
    fallback: disabled
      ? (disabledReason ?? "Recording unlocks by itself as soon as that clears.")
      : (statusHint ??
        (captureMode === "freedom"
          ? "Tap the microphone and answer in your own words."
          : "Tap the microphone and read the target out loud.")),
    hasTake: take !== null,
  });

  const buttonDisabled = disabled || recorder.busy;
  const hearingTarget = targetText !== undefined && speech.activeText === targetText;
  const statusText = speech.error && !recording ? speech.error : hint.text;
  const statusIsError = hint.tone === "error" || (speech.error !== null && !recording);

  return (
    <View style={styles.container}>
      <View style={styles.buttonWrap}>
        {recording ? (
          <Animated.View pointerEvents="none" style={[styles.halo, { transform: [{ scale: halo }] }]} />
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
            buttonDisabled && styles.recordDisabled,
            pressed && styles.recordPressed,
          ]}>
          {recording ? (
            <Square color={colors.snow} size={28} fill={colors.snow} />
          ) : (
            <Mic color={colors.snow} size={32} />
          )}
        </Pressable>
      </View>

      {recording ? (
        <Text maxFontSizeMultiplier={1.4} style={styles.timer}>
          {formatElapsed(recorder.elapsedMs)}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        {targetText ? (
          <Button
            label={hearingTarget ? "Stop" : "Hear target"}
            variant="secondary"
            loading={hearingTarget && speech.isLoading}
            disabled={recording}
            icon={<Volume2 color={buttonIconColor("secondary")} size={16} />}
            onPress={() => speech.toggle(targetText)}
            style={styles.smallButton}
          />
        ) : null}
        {take ? (
          <>
            <Button
              label={playback.playingUri === take.uri ? `Stop ${noun}` : `Play my ${noun}`}
              variant="tonal"
              disabled={recording}
              icon={<Play color={colors.hunter} size={16} />}
              onPress={() => {
                speech.stop();
                if (playback.playingUri === take.uri) playback.stop();
                else void playback.play(take.uri);
              }}
              style={styles.smallButton}
            />
            <Button
              label="Clear"
              variant="tonal"
              accessibilityLabel={`Clear this ${noun}`}
              disabled={recording}
              icon={<Trash2 color={colors.hunter} size={16} />}
              onPress={() => {
                playback.stop();
                setTake(null);
                recorder.reset();
              }}
              style={styles.smallButton}
            />
          </>
        ) : null}
      </View>

      <InfoPanel tone="white" style={styles.status}>
        <Body
          size={type.footnote}
          weight={hint.tone === "neutral" && !statusIsError ? "regular" : "semibold"}
          tone={statusIsError ? "error" : "default"}
          style={styles.statusText}>
          {statusText}
        </Body>
        {hint.showSettingsLink ? (
          <Button
            label="Open Settings"
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
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: overlays.brickHalo,
  },
  recordButton: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.raised,
  },
  recordDisabled: {
    opacity: 0.45,
    boxShadow: undefined,
  },
  recordPressed: {
    transform: [{ scale: 0.95 }],
  },
  timer: {
    fontFamily: fonts.bodyBold,
    fontSize: type.body,
    color: colors.brickText,
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  smallButton: {
    minHeight: 44,
    paddingVertical: spacing.sm,
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
