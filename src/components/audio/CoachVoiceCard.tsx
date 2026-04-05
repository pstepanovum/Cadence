"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Speaker, Square } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  type CoachVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
} from "@/hooks/useCoachVoice";

const SAMPLE_TEXT =
  "Hello! I'm your pronunciation coach. Say the word clearly, and I'll guide you through every sound.";

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const AGE_OPTIONS = [
  { value: "child", label: "Child" },
  { value: "teenager", label: "Teenager" },
  { value: "young adult", label: "Young adult" },
  { value: "middle-aged", label: "Middle-aged" },
  { value: "elderly", label: "Elderly" },
];

const PITCH_OPTIONS = [
  { value: "very low pitch", label: "Very low" },
  { value: "low pitch", label: "Low" },
  { value: "moderate pitch", label: "Moderate" },
  { value: "high pitch", label: "High" },
  { value: "very high pitch", label: "Very high" },
];

const ACCENT_OPTIONS = [
  { value: "american accent", label: "American" },
  { value: "australian accent", label: "Australian" },
  { value: "british accent", label: "British" },
  { value: "canadian accent", label: "Canadian" },
  { value: "chinese accent", label: "Chinese" },
  { value: "indian accent", label: "Indian" },
  { value: "japanese accent", label: "Japanese" },
  { value: "korean accent", label: "Korean" },
  { value: "portuguese accent", label: "Portuguese" },
  { value: "russian accent", label: "Russian" },
];

interface CoachVoiceCardProps {
  settings: CoachVoiceSettings;
  instruct: string;
  onUpdate: (next: Partial<CoachVoiceSettings>) => void;
}

export function CoachVoiceCard({ settings, instruct, onUpdate }: CoachVoiceCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Clear cached sample whenever instruct changes so next play uses new settings
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
    setError(null);
  }, [instruct]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  async function handlePlaySample() {
    setError(null);

    // If already playing, stop
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    // If cached, replay
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play().catch(() => {});
      setIsPlaying(true);
      return;
    }

    // Fetch new sample
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ text: SAMPLE_TEXT, instruct });
      const response = await fetch(`/api/reference-audio?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Voice sample unavailable.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audioRef.current = audio;
      audioUrlRef.current = url;
      await audio.play().catch(() => {});
      setIsPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice sample unavailable.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="bg-white">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-sage-green/15 px-4 py-2 text-sm font-medium text-sage-green">
              <Speaker size={18} color="currentColor" />
              Coach voice
            </div>
            <p className="max-w-lg text-sm leading-7 text-iron-grey">
              Choose how your coach sounds. Applies to every reference pronunciation
              on the next playback — changing a setting clears the cached audio.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => void handlePlaySample()}
              disabled={isLoading}
            >
              {isPlaying ? (
                <Square size={16} filled color="currentColor" />
              ) : (
                <Play size={16} filled color="currentColor" />
              )}
              {isLoading
                ? "Generating..."
                : isPlaying
                  ? "Stop sample"
                  : "Hear this voice"}
            </Button>

            <div className="hidden rounded-3xl bg-vanilla-cream px-4 py-3 text-sm font-semibold text-hunter-green whitespace-nowrap sm:block">
              {[settings.gender, settings.age, settings.pitch, settings.accent]
                .filter(Boolean)
                .join(", ") || "Default voice"}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="eyebrow block text-xs text-sage-green">Gender</span>
            <Select
              value={settings.gender}
              onChange={(e) => onUpdate({ gender: e.target.value })}
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="eyebrow block text-xs text-sage-green">Age</span>
            <Select
              value={settings.age}
              onChange={(e) => onUpdate({ age: e.target.value })}
            >
              {AGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="eyebrow block text-xs text-sage-green">Pitch</span>
            <Select
              value={settings.pitch}
              onChange={(e) => onUpdate({ pitch: e.target.value })}
            >
              {PITCH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="eyebrow block text-xs text-sage-green">Accent</span>
            <Select
              value={settings.accent}
              onChange={(e) => onUpdate({ accent: e.target.value })}
            >
              {ACCENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {error ? (
          <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
            {error}
          </div>
        ) : null}

        <button
          className="text-sm font-semibold text-sage-green hover:text-hunter-green transition-colors"
          onClick={() => onUpdate({ ...DEFAULT_VOICE_SETTINGS })}
        >
          Reset to default
        </button>
      </div>
    </Card>
  );
}
