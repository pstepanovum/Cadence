// The recording state machine behind every "tap the mic and read this out
// loud" panel in the app.
//
// It lives apart from the expo-audio calls on purpose: the hook
// (src/hooks/useTakeRecorder.ts) drives the native recorder and feeds the
// results back in as events, and everything that decides what the learner is
// allowed to do next — and what the panel says — happens here, where it can be
// unit tested without a device (see mobile/tests/take-machine.test.ts).

/** Anything shorter than this is a mis-tap, not a take. */
export const MIN_TAKE_MS = 600;

/** Hard cap so a forgotten recording never uploads a huge file. */
export const MAX_TAKE_MS = 30_000;

/** Below this the panel starts warning that the cap is coming. */
export const WARN_TAKE_MS = MAX_TAKE_MS - 5_000;

export type TakeStatus =
  | "idle"
  | "requesting"
  | "denied"
  | "recording"
  | "stopping"
  | "processing"
  | "error";

export interface TakeState {
  status: TakeStatus;
  /** Milliseconds elapsed in the current or most recent recording. */
  elapsedMs: number;
  /** Set while status is "error" or "denied". */
  message: string | null;
  /** True when the last recording was cut short by the system, not the user. */
  interrupted: boolean;
}

export type TakeEvent =
  | { type: "PRESS" }
  | { type: "PERMISSION"; granted: boolean }
  | { type: "STARTED" }
  | { type: "TICK"; elapsedMs: number }
  | { type: "CAPTURED"; durationMs: number; uri: string | null }
  | { type: "SCORED" }
  | { type: "FAILED"; message: string }
  | { type: "INTERRUPTED" }
  | { type: "RESET" };

export const initialTakeState: TakeState = {
  status: "idle",
  elapsedMs: 0,
  message: null,
  interrupted: false,
};

function idle(overrides: Partial<TakeState> = {}): TakeState {
  return { ...initialTakeState, ...overrides };
}

export function takeReducer(state: TakeState, event: TakeEvent): TakeState {
  switch (event.type) {
    case "PRESS":
      // A press means "start" everywhere except mid-recording, where it means
      // "stop". From "denied" it is a retry: the learner may have just granted
      // the permission in Settings and come back.
      if (state.status === "recording") {
        return { ...state, status: "stopping" };
      }
      if (state.status === "requesting" || state.status === "stopping" || state.status === "processing") {
        return state;
      }
      return idle({ status: "requesting" });

    case "PERMISSION":
      if (state.status !== "requesting") return state;
      return event.granted
        ? { ...state, status: "recording", elapsedMs: 0, message: null }
        : idle({
            status: "denied",
            message:
              "Cadence needs the microphone to score your pronunciation. Turn it on in Settings, then tap the microphone again.",
          });

    case "STARTED":
      if (state.status !== "recording" && state.status !== "requesting") return state;
      return { ...state, status: "recording", elapsedMs: 0, message: null, interrupted: false };

    case "TICK":
      if (state.status !== "recording") return state;
      // Reaching the cap stops the take for the learner rather than dropping it.
      if (event.elapsedMs >= MAX_TAKE_MS) {
        return { ...state, status: "stopping", elapsedMs: MAX_TAKE_MS };
      }
      return { ...state, elapsedMs: event.elapsedMs };

    case "CAPTURED": {
      if (state.status !== "stopping" && state.status !== "recording") return state;
      if (!event.uri) {
        return idle({
          status: "error",
          message: "That take could not be saved. Try recording it again.",
        });
      }
      if (event.durationMs < MIN_TAKE_MS) {
        return idle({
          status: "error",
          elapsedMs: event.durationMs,
          message: "That was too short to score. Hold the recording while you say the whole thing.",
        });
      }
      return { status: "processing", elapsedMs: event.durationMs, message: null, interrupted: false };
    }

    case "SCORED":
      if (state.status !== "processing") return state;
      return idle({ elapsedMs: state.elapsedMs });

    case "FAILED":
      return idle({ status: "error", elapsedMs: state.elapsedMs, message: event.message });

    case "INTERRUPTED":
      // A call, a Siri request or the app going to the background: the audio
      // session is gone, so the half-recorded take is worthless. Say so rather
      // than scoring silence.
      if (state.status !== "recording" && state.status !== "stopping") return state;
      return idle({
        status: "error",
        message: "Recording stopped because something else took over the microphone. Tap to record again.",
        interrupted: true,
      });

    case "RESET":
      return initialTakeState;

    default:
      return state;
  }
}

/** True while the native recorder should be running. */
export function isCapturing(state: TakeState): boolean {
  return state.status === "recording" || state.status === "stopping";
}

/** True when the mic button should be disabled outright. */
export function isBusy(state: TakeState): boolean {
  return state.status === "requesting" || state.status === "stopping" || state.status === "processing";
}

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface TakeHint {
  /** One line under the mic button. */
  text: string;
  tone: "neutral" | "active" | "warning" | "error";
  /** Shown only when the learner has to leave the app to fix things. */
  showSettingsLink: boolean;
}

/**
 * The single source of truth for what the recorder panel says. `fallback` is
 * the caller's own idle copy ("Exam mode: one careful take per word", etc).
 */
export function describeTake(
  state: TakeState,
  options: { fallback?: string; hasTake?: boolean } = {},
): TakeHint {
  switch (state.status) {
    case "requesting":
      return { text: "Waiting for microphone access…", tone: "neutral", showSettingsLink: false };
    case "denied":
      return {
        text: state.message ?? "Microphone access is off.",
        tone: "error",
        showSettingsLink: true,
      };
    case "recording":
      return {
        text:
          state.elapsedMs >= WARN_TAKE_MS
            ? `Recording ${formatElapsed(state.elapsedMs)} — wrapping up soon.`
            : `Recording ${formatElapsed(state.elapsedMs)} — tap again when you're done.`,
        tone: state.elapsedMs >= WARN_TAKE_MS ? "warning" : "active",
        showSettingsLink: false,
      };
    case "stopping":
      return { text: "Finishing the take…", tone: "active", showSettingsLink: false };
    case "processing":
      return { text: "Scoring your take…", tone: "active", showSettingsLink: false };
    case "error":
      return { text: state.message ?? "Something went wrong.", tone: "error", showSettingsLink: false };
    case "idle":
    default:
      return {
        text:
          options.fallback ??
          (options.hasTake
            ? "Take ready. Tap the microphone to record it again."
            : "Tap the microphone and read the target out loud."),
        tone: "neutral",
        showSettingsLink: false,
      };
  }
}
