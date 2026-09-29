import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { AppState, Linking } from "react-native";
import type { RecordedAudio } from "@/api/endpoints";
import {
  enablePlaybackMode,
  enableRecordingMode,
  RECORDING_OPTIONS,
  recordedAudioFromUri,
} from "@/audio/recorder";
import {
  describeTake,
  initialTakeState,
  isBusy,
  MAX_TAKE_MS,
  takeReducer,
  type TakeHint,
  type TakeState,
} from "@/audio/take-machine";

/** How often the level meter and the elapsed counter refresh. */
const POLL_INTERVAL_MS = 100;

export interface TakeRecorder {
  state: TakeState;
  isRecording: boolean;
  /** True while a tap should be ignored (permission prompt, stop, scoring). */
  busy: boolean;
  /** 0-1, for the level ring around the mic button. */
  level: number;
  elapsedMs: number;
  /** Copy for the status strip, derived from the state machine. */
  hint: (options?: { fallback?: string; hasTake?: boolean }) => TakeHint;
  /** One entry point for the mic button: starts, or stops and returns the take. */
  toggle: (baseName?: string) => Promise<RecordedAudio | null>;
  /** Call once the caller has finished scoring a take. */
  settle: (failure?: string) => void;
  reset: () => void;
  /** Opens the OS settings page so a denied microphone is not a dead end. */
  openSettings: () => void;
}

/**
 * Drives expo-audio from the take state machine in src/audio/take-machine.ts.
 *
 * Everything that decides what happens next — whether a take is long enough,
 * what the panel says, whether a tap is allowed — lives in the reducer, which
 * is unit tested. This hook only performs the effects the reducer asks for.
 */
export function useTakeRecorder(): TakeRecorder {
  const [state, dispatch] = useReducer(takeReducer, initialTakeState);

  // Lets the async callbacks and the native status listener read the current
  // state without being re-created on every render. Both are written in an
  // effect rather than during render: every reader runs after commit.
  const stateRef = useRef(state);
  const interruptRef = useRef<() => void>(() => {});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    // A recorder-level error (the media daemon resetting, a route change the
    // platform could not survive) invalidates the take entirely.
    if (status.hasError || status.mediaServicesDidReset) {
      interruptRef.current();
    }
  });
  const recorderState = useAudioRecorderState(recorder, POLL_INTERVAL_MS);

  const interrupt = useCallback(() => {
    const status = stateRef.current.status;
    if (status !== "recording" && status !== "stopping") return;
    // Stop the hardware first so the two never disagree about whether the
    // microphone is live.
    recorder.stop().catch(() => {
      // The session is already gone; the machine still needs to hear about it.
    });
    dispatch({ type: "INTERRUPTED" });
  }, [recorder]);

  useEffect(() => {
    interruptRef.current = interrupt;
  }, [interrupt]);

  // A call, Siri, or the app being backgrounded takes the microphone away.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") interruptRef.current();
    });
    return () => subscription.remove();
  }, []);

  const stopRecording = useCallback(
    async (baseName: string): Promise<RecordedAudio | null> => {
      const before = stateRef.current;
      let uri: string | null = null;
      // durationMillis freezes once the recorder stops, so read it first.
      const durationMs = Math.min(recorderState.durationMillis, MAX_TAKE_MS);

      try {
        await recorder.stop();
        uri = recorder.uri ?? null;
      } catch {
        uri = null;
      }
      try {
        await enablePlaybackMode();
      } catch {
        // Non-fatal: playback may route oddly, but the take itself is safe.
      }

      const captured = { type: "CAPTURED", durationMs, uri } as const;
      dispatch(captured);
      // The reducer is the authority on whether this take is usable at all.
      return takeReducer(before, captured).status === "processing" && uri
        ? recordedAudioFromUri(uri, baseName)
        : null;
    },
    [recorder, recorderState.durationMillis],
  );

  const startRecording = useCallback(async () => {
    dispatch({ type: "PRESS" });
    try {
      // Ask only when we have to: iOS never shows a second prompt, so checking
      // first lets a previously denied learner be pointed at Settings instead.
      const existing = await getRecordingPermissionsAsync();
      const permission = existing.granted ? existing : await requestRecordingPermissionsAsync();
      dispatch({ type: "PERMISSION", granted: permission.granted });
      if (!permission.granted) return;

      await enableRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      dispatch({ type: "STARTED" });
    } catch (cause) {
      dispatch({
        type: "FAILED",
        message:
          cause instanceof Error && cause.message
            ? cause.message
            : "The microphone could not be started. Try again.",
      });
    }
  }, [recorder]);

  const toggle = useCallback(
    async (baseName = "attempt"): Promise<RecordedAudio | null> => {
      const current = stateRef.current;
      if (isBusy(current)) return null;
      if (current.status === "recording") return stopRecording(baseName);
      await startRecording();
      return null;
    },
    [startRecording, stopRecording],
  );

  // Enforce the duration cap: the machine decides, the hook stops the hardware.
  const autoStoppingRef = useRef(false);
  useEffect(() => {
    if (
      !recorderState.isRecording ||
      recorderState.durationMillis < MAX_TAKE_MS ||
      autoStoppingRef.current
    ) {
      return;
    }
    autoStoppingRef.current = true;
    stopRecording("attempt").finally(() => {
      autoStoppingRef.current = false;
    });
  }, [recorderState.isRecording, recorderState.durationMillis, stopRecording]);

  const settle = useCallback((failure?: string) => {
    dispatch(failure ? { type: "FAILED", message: failure } : { type: "SCORED" });
  }, []);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      // Nothing more we can offer; the message already explains the fix.
    });
  }, []);

  // The elapsed counter comes from the hardware while a take is live and from
  // the machine afterwards, so the strip keeps showing the length of the take
  // that was just captured.
  const elapsedMs = recorderState.isRecording ? recorderState.durationMillis : state.elapsedMs;

  const hint = useCallback(
    (options?: { fallback?: string; hasTake?: boolean }) =>
      describeTake(
        state.status === "recording" ? { ...state, elapsedMs } : state,
        options,
      ),
    [state, elapsedMs],
  );

  // expo-audio reports metering in dBFS (roughly -160 silent, 0 loudest); the
  // useful speaking range sits in the last 60 dB.
  const level =
    recorderState.isRecording && typeof recorderState.metering === "number"
      ? Math.max(0, Math.min(1, (recorderState.metering + 60) / 60))
      : 0;

  return {
    state,
    isRecording: state.status === "recording",
    busy: isBusy(state),
    level,
    elapsedMs,
    hint,
    toggle,
    settle,
    reset,
    openSettings,
  };
}
