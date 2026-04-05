// FILE: src/components/learn/TheoryNarrationButton.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { useCoachVoice } from "@/hooks/useCoachVoice";

interface TheoryNarrationButtonProps {
  title: string;
  theoryHtml: string | null;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "and")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function TheoryNarrationButton({
  title,
  theoryHtml,
}: TheoryNarrationButtonProps) {
  const { instruct } = useCoachVoice();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const prefetchPromiseRef = useRef<Promise<void> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const narrationText = useMemo(() => {
    const theoryText = stripHtml(theoryHtml ?? "");
    return [title, theoryText].filter(Boolean).join(". ");
  }, [theoryHtml, title]);

  // Clear cached narration whenever the voice changes so the next play re-generates.
  useEffect(() => {
    prefetchPromiseRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
  }, [instruct]);

  const prepareNarration = useCallback(
    async (showLoading: boolean) => {
      if (!narrationText) {
        throw new Error("Theory narration is unavailable for this lesson.");
      }

      if (audioRef.current) {
        return;
      }

      if (!prefetchPromiseRef.current) {
        prefetchPromiseRef.current = (async () => {
          const response = await fetch("/api/reference-audio/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: narrationText, instruct }),
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(payload?.error ?? "Theory narration is unavailable.");
          }

          const blob = await response.blob();
          const nextUrl = URL.createObjectURL(blob);
          const audio = new Audio(nextUrl);
          audio.onended = () => setIsPlaying(false);
          audio.onpause = () => setIsPlaying(false);

          if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
          }

          audioRef.current = audio;
          audioUrlRef.current = nextUrl;
        })().finally(() => {
          prefetchPromiseRef.current = null;
        });
      }

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        await prefetchPromiseRef.current;
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [narrationText, instruct],
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      prefetchPromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!narrationText) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void prepareNarration(false).catch(() => {});
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [narrationText, prepareNarration]);

  async function handleToggleNarration() {
    setError(null);

    if (!narrationText) {
      setError("Theory narration is unavailable for this lesson.");
      return;
    }

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await prepareNarration(true);

      if (!audioRef.current) {
        throw new Error("Theory narration is unavailable.");
      }

      audioRef.current.currentTime = 0;
      await audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Theory narration is unavailable.",
      );
      setIsPlaying(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        onMouseEnter={() => {
          void prepareNarration(false).catch(() => {});
        }}
        onFocus={() => {
          void prepareNarration(false).catch(() => {});
        }}
        onClick={() => void handleToggleNarration()}
        className="text-white"
      >
        {isPlaying ? (
          <Square size={16} filled color="currentColor" />
        ) : (
          <Play size={16} filled color="currentColor" />
        )}
        {isLoading
          ? "Loading narration..."
          : isPlaying
            ? "Stop narration"
            : "Hear this lesson"}
      </Button>

      {error ? (
        <p className="text-sm leading-6 text-blushed-brick">{error}</p>
      ) : null}
    </div>
  );
}
