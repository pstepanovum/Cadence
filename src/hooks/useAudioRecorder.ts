// FILE: src/hooks/useAudioRecorder.ts
"use client";

import { useEffect, useRef, useState } from "react";

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

async function convertBlobToWav(blob: Blob) {
  if (typeof window === "undefined") {
    return blob;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return blob;
  }

  const audioContext = new AudioContextConstructor();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelCount = decoded.numberOfChannels;
    const monoSamples = new Float32Array(decoded.length);

    for (let channel = 0; channel < channelCount; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < channelData.length; index += 1) {
        monoSamples[index] += channelData[index] / channelCount;
      }
    }

    return new Blob([encodeWav(monoSamples, decoded.sampleRate)], {
      type: "audio/wav",
    });
  } finally {
    await audioContext.close();
  }
}

export function useAudioRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cleanupTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearRecording() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
  }

  useEffect(() => {
    return () => {
      cleanupTracks();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  async function startRecording() {
    if (isRecording) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("This browser does not support microphone recording.");
      return;
    }

    try {
      clearRecording();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setError(null);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("Recording failed. Please try again.");
        setIsRecording(false);
        cleanupTracks();
      };

      recorder.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        try {
          const blob = await convertBlobToWav(rawBlob);
          const nextUrl = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioUrl(nextUrl);
        } catch {
          const nextUrl = URL.createObjectURL(rawBlob);
          setAudioBlob(rawBlob);
          setAudioUrl(nextUrl);
        } finally {
          setIsRecording(false);
          cleanupTracks();
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Microphone access was denied.",
      );
      setIsRecording(false);
      cleanupTracks();
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      return;
    }

    recorderRef.current.stop();
  }

  return {
    audioBlob,
    audioUrl,
    clearRecording,
    error,
    isRecording,
    startRecording,
    stopRecording,
  };
}
