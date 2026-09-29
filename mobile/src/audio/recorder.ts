import {
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  type RecordingOptions,
} from "expo-audio";
import { Platform } from "react-native";
import type { RecordedAudio } from "@/api/endpoints";

// The scoring engine wants 16 kHz mono PCM. iOS can record straight to WAV
// (LINEARPCM); Android's MediaRecorder cannot emit WAV, so we record AAC/m4a
// and the ai-engine transcodes it via ffmpeg.
export const RECORDING_OPTIONS: RecordingOptions = {
  extension: Platform.OS === "ios" ? ".wav" : ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  // The recorder panel draws a live level meter, which needs metering on.
  isMeteringEnabled: true,
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: ".m4a",
    outputFormat: "mpeg4",
    audioEncoder: "aac",
    sampleRate: 16000,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

/**
 * Recording takes the audio session exclusively: the learner is about to speak,
 * and anything playing underneath would both distract them and bleed into the
 * take. `playsInSilentMode` keeps audio alive when the ring/silent switch is
 * flipped, which is the normal state of a commuting phone — practising in
 * silence and getting no reference audio back would read as a broken app.
 */
export async function enableRecordingMode() {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
    shouldPlayInBackground: false,
  });
}

/**
 * Leaving recording mode matters on iOS: while it is active, playback is routed
 * to the quiet earpiece speaker instead of the main one, so a reference word
 * played without this sounds broken. Playback only ducks other audio rather
 * than stopping it, since these are one- or two-second clips.
 */
export async function enablePlaybackMode() {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: "duckOthers",
    shouldPlayInBackground: false,
  });
}

export function recordedAudioFromUri(uri: string, baseName: string): RecordedAudio {
  const isWav = Platform.OS === "ios";
  return {
    uri,
    name: `${baseName}${isWav ? ".wav" : ".m4a"}`,
    type: isWav ? "audio/wav" : "audio/m4a",
  };
}
