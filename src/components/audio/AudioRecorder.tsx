// FILE: src/components/audio/AudioRecorder.tsx
"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Microphone, Play, Square } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

interface AudioRecorderProps {
  className?: string;
  captureMode?: "target" | "freedom";
  disabled?: boolean;
  embedded?: boolean;
  showIntro?: boolean;
  showStatus?: boolean;
  targetWord?: string;
  instruct?: string;
  onRecordingComplete?: (blob: Blob) => void;
  onClear?: () => void;
}

export function AudioRecorder({
  className,
  captureMode = "target",
  disabled,
  embedded = false,
  showIntro = true,
  showStatus = true,
  targetWord,
  instruct,
  onRecordingComplete,
  onClear,
}: AudioRecorderProps) {
  const {
    audioBlob,
    audioUrl,
    clearRecording,
    error,
    isRecording,
    startRecording,
    stopRecording,
  } = useAudioRecorder();
  const audioRef = useRef<HTMLAudioElement>(null);
  const referenceAudioRef = useRef<HTMLAudioElement | null>(null);
  const referenceAudioUrlRef = useRef<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const targetIsPhrase =
    typeof targetWord === "string" &&
    targetWord.trim().split(/\s+/).filter(Boolean).length > 2;
  const isFreedomMode = captureMode === "freedom";
  const handleRecordingComplete = useEffectEvent((blob: Blob) => {
    onRecordingComplete?.(blob);
  });

  useEffect(() => {
    if (audioBlob) {
      handleRecordingComplete(audioBlob);
    }
  }, [audioBlob]);

  useEffect(() => {
    if (referenceAudioUrlRef.current) {
      URL.revokeObjectURL(referenceAudioUrlRef.current);
      referenceAudioUrlRef.current = null;
    }

    if (referenceAudioRef.current) {
      referenceAudioRef.current.pause();
      referenceAudioRef.current = null;
    }

    setReferenceError(null);
  }, [targetWord, instruct]);

  useEffect(() => {
    return () => {
      if (referenceAudioUrlRef.current) {
        URL.revokeObjectURL(referenceAudioUrlRef.current);
        referenceAudioUrlRef.current = null;
      }

      if (referenceAudioRef.current) {
        referenceAudioRef.current.pause();
        referenceAudioRef.current = null;
      }
    };
  }, []);

  async function playReferenceAudio() {
    if (!targetWord) {
      return;
    }

    setReferenceError(null);

    if (referenceAudioRef.current) {
      referenceAudioRef.current.currentTime = 0;
      await referenceAudioRef.current.play().catch(() => {});
      return;
    }

    try {
      setIsLoadingReference(true);
      const params = new URLSearchParams({ text: targetWord });
      if (instruct) params.set("instruct", instruct);
      const response = await fetch(`/api/reference-audio?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Reference pronunciation is unavailable.");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      const audio = new Audio(nextUrl);
      referenceAudioRef.current = audio;
      referenceAudioUrlRef.current = nextUrl;
      await audio.play().catch(() => {});
    } catch (nextError) {
      setReferenceError(
        nextError instanceof Error
          ? nextError.message
          : "Reference pronunciation is unavailable.",
      );
    } finally {
      setIsLoadingReference(false);
    }
  }

  return (
    <div
      className={cn(
        embedded ? "p-0" : "rounded-3xl bg-white p-5",
        className,
      )}
    >
      <audio ref={audioRef} src={audioUrl ?? undefined} className="hidden" />

      <div className="space-y-5">
        {showIntro ? (
          <div className="mx-auto max-w-xl space-y-2 text-center">
            <p className="eyebrow text-sm text-sage-green">Recorder</p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              Capture one take
            </h3>
            <p className="text-sm leading-7 text-iron-grey">
              {isFreedomMode
                ? "Tap the microphone, answer in your own words, then stop the take to send it into the coach flow."
                : `Tap the microphone, say the target ${targetIsPhrase ? "reply" : "word"} once, then stop the take to send it into the pronunciation review flow.`}
            </p>
          </div>
        ) : null}

        <div className="flex justify-center">
          <Button
            variant={isRecording ? "danger" : "primary"}
            size="icon"
            disabled={disabled}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={cn(
              "shrink-0",
              embedded ? "h-24 w-24" : "h-20 w-20",
            )}
            onClick={isRecording ? stopRecording : () => void startRecording()}
          >
            {isRecording ? (
              <Square size={28} filled color="currentColor" />
            ) : (
              <Microphone size={28} filled color="currentColor" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {targetWord ? (
            <Button
              variant="secondary"
              onClick={() => void playReferenceAudio()}
              disabled={isLoadingReference || isRecording}
            >
              <Play size={18} filled color="currentColor" />
              {isLoadingReference ? "Loading target voice..." : "Hear target"}
            </Button>
          ) : null}

          {audioUrl ? (
            <Button
              variant="ghost"
              aria-label="Play latest take"
              onClick={() => {
                audioRef.current?.pause();
                if (audioRef.current) {
                  audioRef.current.currentTime = 0;
                }
                void audioRef.current?.play();
              }}
            >
              <Play size={18} filled color="currentColor" />
              {targetIsPhrase ? "Play my reply" : "Play my take"}
            </Button>
          ) : null}

          {audioUrl ? (
            <Button
              variant="ghost"
              onClick={() => {
                clearRecording();
                onClear?.();
              }}
            >
              {targetIsPhrase ? "Clear reply" : "Clear take"}
            </Button>
          ) : null}
        </div>

        {showStatus ? (
          <div
            className={cn(
              "rounded-3xl bg-vanilla-cream/80 px-4 py-3 text-center text-sm text-iron-grey",
              embedded && "mx-auto max-w-xl",
            )}
          >
            {isRecording
              ? isFreedomMode
                ? "Recording now. Answer naturally, then tap the square to stop."
                : `Recording now. Say the target ${targetIsPhrase ? "reply" : "word"} clearly and tap the square to stop.`
              : audioUrl
                ? `Latest ${targetIsPhrase ? "reply" : "take"} is ready. Play it back, compare it, and record again if needed.`
                : `No recording yet. The first ${targetIsPhrase ? "reply" : "take"} will be used as the current pronunciation sample.`}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
          {error}
        </div>
      ) : null}

      {referenceError ? (
        <div className="mt-4 rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
          {referenceError}
        </div>
      ) : null}
    </div>
  );
}
