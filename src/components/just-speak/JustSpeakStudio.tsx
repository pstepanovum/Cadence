"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square } from "griddy-icons";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { cn } from "@/lib/utils";

type JustSpeakFeedback = {
  overallSummary: string;
  whatWentWell: string[];
  whatToImprove: string[];
  practiceDrill: string;
  coachScript: string;
};

type JustSpeakResult = {
  whisperTranscript: string;
  feedback: JustSpeakFeedback | null;
};

type JustSpeakHistoryItem = {
  id: string;
  transcript: string;
  createdAt: string;
  feedback: JustSpeakFeedback | null;
};

const HISTORY_KEY = "cadence-just-speak-history";
const MAX_HISTORY = 24;

function safeReadHistory(): JustSpeakHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => item as Partial<JustSpeakHistoryItem>)
      .map((item) => ({
        id: String(item.id ?? ""),
        transcript: String(item.transcript ?? "").trim(),
        createdAt: String(item.createdAt ?? ""),
        feedback: (item.feedback ?? null) as JustSpeakFeedback | null,
      }))
      .filter((item) => item.id && item.createdAt)
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function safeWriteHistory(items: JustSpeakHistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    // ignore
  }
}

function formatWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function JustSpeakStudio() {
  const { instruct } = useCoachVoice();
  const [phase, setPhase] = useState<"idle" | "assessing" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JustSpeakResult | null>(null);
  const [history, setHistory] = useState<JustSpeakHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const items = safeReadHistory();
    setHistory(items);
    setActiveHistoryId(items[0]?.id ?? null);
  }, []);

  const activeHistoryItem = useMemo(
    () => history.find((item) => item.id === activeHistoryId) ?? null,
    [history, activeHistoryId],
  );

  const canRecord = phase !== "assessing";

  const coachScript = useMemo(() => {
    const script =
      result?.feedback?.coachScript?.trim() ??
      activeHistoryItem?.feedback?.coachScript?.trim();
    if (script) return script;
    const heard = (result?.whisperTranscript ?? activeHistoryItem?.transcript ?? "").trim();
    if (!heard) return "";
    if (!heard) return "Try again and speak a little slower, one phrase at a time.";
    return "Nice try. Speak a little slower and exaggerate the stressed syllables once, then repeat normally.";
  }, [result, activeHistoryItem]);

  async function stopVoice() {
    voiceAudioRef.current?.pause();
    if (voiceAudioRef.current) voiceAudioRef.current.currentTime = 0;
    setIsSpeaking(false);
  }

  async function playCoachVoice() {
    if (!coachScript) return;

    if (voiceAudioRef.current && !voiceAudioRef.current.paused) {
      await stopVoice();
      return;
    }

    if (voiceAudioRef.current && voiceAudioRef.current.paused) {
      await voiceAudioRef.current.play().catch(() => {});
      setIsSpeaking(true);
      return;
    }

    try {
      setIsLoadingVoice(true);
      const params = new URLSearchParams({ text: coachScript, instruct });
      const response = await fetch(`/api/reference-audio?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Coach voice unavailable.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      voiceUrlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setIsSpeaking(false);
      audio.onpause = () => setIsSpeaking(false);
      voiceAudioRef.current = audio;
      await audio.play().catch(() => {});
      setIsSpeaking(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coach voice unavailable.");
    } finally {
      setIsLoadingVoice(false);
    }
  }

  async function runJustSpeak(blob: Blob) {
    setPhase("assessing");
    setError(null);
    setResult(null);
    await stopVoice();

    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current);
      voiceUrlRef.current = null;
    }
    voiceAudioRef.current = null;

    try {
      const formData = new FormData();
      formData.set("audio", blob, "just-speak.wav");
      const response = await fetch("/api/just-speak", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as JustSpeakResult | { error?: string } | null;

      if (!response.ok || !payload || ("error" in payload && payload.error)) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Just Speak failed.");
      }

      setResult(payload as JustSpeakResult);
      setPhase("ready");

      const transcript = String((payload as JustSpeakResult).whisperTranscript ?? "").trim();
      const feedback = (payload as JustSpeakResult).feedback ?? null;
      const newItem: JustSpeakHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        transcript,
        feedback,
        createdAt: new Date().toISOString(),
      };
      const next = [newItem, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      setActiveHistoryId(newItem.id);
      safeWriteHistory(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Just Speak failed.");
      setPhase("idle");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
      <Card className="bg-white">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-sage-green">Just Speak · Pro</p>
            <h1 className="text-3xl font-semibold text-hunter-green sm:text-4xl">
              Just speak. Get instant feedback.
            </h1>
            <p className="text-sm leading-7 text-iron-grey">
              Press record, speak naturally, and we’ll transcribe what you said and coach your clarity.
            </p>
          </div>

          <div className={cn("rounded-3xl bg-vanilla-cream px-4 py-4", !canRecord && "opacity-70")}>
            <AudioRecorder
              embedded
              showIntro={false}
              showStatus={true}
              disabled={!canRecord}
              captureMode="freedom"
              instruct={instruct}
              onRecordingComplete={(blob) => void runJustSpeak(blob)}
            />
          </div>

          {error ? (
            <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
              {error}
            </div>
          ) : null}

          {phase === "assessing" ? (
            <div className="rounded-3xl bg-vanilla-cream px-4 py-3 text-sm text-iron-grey">
              Transcribing your take…
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="bg-white">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="eyebrow text-sm text-sage-green">History</p>
              <h2 className="text-2xl font-semibold text-hunter-green">
                {history.length ? "Recent takes" : "Record to start a history"}
              </h2>
            </div>

            <Button
              variant="secondary"
              className="gap-2"
              onClick={() => void playCoachVoice()}
              disabled={(!result && !activeHistoryItem) || !coachScript || isLoadingVoice}
            >
              {isSpeaking ? (
                <Square size={16} filled color="currentColor" />
              ) : (
                <Play size={16} filled color="currentColor" />
              )}
              {isLoadingVoice ? "Generating..." : isSpeaking ? "Stop voice" : "Play coach"}
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Recent</p>
              {history.length ? (
                <div className="mt-3 space-y-2">
                  {history.map((item) => {
                    const isActive = item.id === activeHistoryId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "w-full rounded-3xl px-4 py-3 text-left transition-colors",
                          isActive ? "bg-white" : "bg-white/0 hover:bg-white/60",
                        )}
                        onClick={() => setActiveHistoryId(item.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-hunter-green">
                            {item.transcript ? item.transcript.slice(0, 42) : "Unclear take"}
                            {item.transcript.length > 42 ? "…" : ""}
                          </p>
                          <span className="shrink-0 text-xs text-iron-grey">
                            {formatWhen(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-iron-grey">
                          {item.feedback ? "Coached" : "Transcript only"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-7 text-iron-grey">
                  Your last takes will appear here.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">What you said</p>
                <p className="mt-2 text-sm leading-7 text-iron-grey">
                  {result?.whisperTranscript?.trim() ||
                    activeHistoryItem?.transcript ||
                    "—"}
                </p>
              </div>

              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Coach summary</p>
                <p className="mt-2 text-sm leading-7 text-iron-grey">
                  {result?.feedback?.overallSummary ??
                    activeHistoryItem?.feedback?.overallSummary ??
                    (history.length
                      ? "Configure GEMINI_API_KEY to unlock coaching feedback."
                      : "Record a take to see coaching feedback here.")}
                </p>
              </div>

              {(result?.feedback ?? activeHistoryItem?.feedback) ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                    <p className="eyebrow text-xs text-sage-green">What went well</p>
                    <ul className="mt-2 space-y-2 text-sm leading-7 text-iron-grey">
                      {(result?.feedback?.whatWentWell ?? activeHistoryItem?.feedback?.whatWentWell ?? []).length ? (
                        (result?.feedback?.whatWentWell ?? activeHistoryItem?.feedback?.whatWentWell ?? []).map((line) => (
                          <li key={line}>- {line}</li>
                        ))
                      ) : (
                        <li>- Keep going — record another take.</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                    <p className="eyebrow text-xs text-sage-green">What to improve</p>
                    <ul className="mt-2 space-y-2 text-sm leading-7 text-iron-grey">
                      {(result?.feedback?.whatToImprove ?? activeHistoryItem?.feedback?.whatToImprove ?? []).length ? (
                        (result?.feedback?.whatToImprove ?? activeHistoryItem?.feedback?.whatToImprove ?? []).map((line) => (
                          <li key={line}>- {line}</li>
                        ))
                      ) : (
                        <li>- Aim for clearer word boundaries.</li>
                      )}
                    </ul>
                  </div>
                </div>
              ) : null}

              {(result?.feedback?.practiceDrill ?? activeHistoryItem?.feedback?.practiceDrill) ? (
                <div className="rounded-3xl bg-hunter-green px-5 py-5 text-bright-snow">
                  <p className="eyebrow text-xs text-yellow-green/80">Practice drill</p>
                  <p className="mt-3 text-sm leading-7 text-bright-snow/85">
                    {result?.feedback?.practiceDrill ?? activeHistoryItem?.feedback?.practiceDrill}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

