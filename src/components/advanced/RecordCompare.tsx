// FILE: src/components/advanced/RecordCompare.tsx
//
// Record yourself saying a sentence, keep the take, and hear it next to the
// target: Target, You, or both back to back (A/B). Takes stay in this
// browser (recordings-store.ts) and are never uploaded.
"use client";

import { Microphone, Pause, Play, Square, SwapHorizontal, Trash } from "griddy-icons";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatDuration, MAX_TAKE_SECONDS, takesFor, type Recording } from "@/lib/platform/recordings.ts";
import { cn } from "@/lib/utils";
import { deleteTakes, saveTake, takeBlob, useRecordingIndex } from "./recordings-store";
import { playTarget, stopTarget } from "./target-audio";

type Status = "idle" | "recording" | "saving" | "denied" | "unsupported";

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]) if (MediaRecorder.isTypeSupported(type)) return type;
  return "";
}

export function RecordCompare({ itemId, text, audioUrl, compact = false }: { itemId: string; text: string; audioUrl?: string | null; compact?: boolean }) {
  const index = useRecordingIndex();
  const takes = useMemo(() => (index ? takesFor(index, itemId) : []), [index, itemId]);
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      player.current?.pause();
      stopTarget();
    },
    [],
  );

  async function start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setStatus("unsupported");
    stopAll();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setStatus("denied");
    }
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      const durationMs = Date.now() - started.current;
      if (durationMs < 400 || chunks.length === 0) return setStatus("idle");
      setStatus("saving");
      try {
        await saveTake(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), { itemId, text, durationMs });
      } finally {
        setStatus("idle");
      }
    };
    recorder.current = rec;
    started.current = Date.now();
    setElapsed(0);
    timer.current = setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (ms >= MAX_TAKE_SECONDS * 1000) stop();
    }, 200);
    rec.start();
    setStatus("recording");
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function stopAll() {
    player.current?.pause();
    player.current = null;
    stopTarget();
    setPlaying(null);
  }

  async function playTake(take: Recording): Promise<void> {
    const blob = await takeBlob(take);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      player.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  }

  async function run(kind: "target" | "you" | "ab", take?: Recording) {
    if (playing) return stopAll();
    setPlaying(kind + (take?.id ?? ""));
    try {
      if (kind !== "you") await playTarget(text, { audioUrl });
      if (kind !== "target" && take) await playTake(take);
    } finally {
      setPlaying(null);
    }
  }

  const latest = takes[0];
  const busy = status === "recording" || status === "saving";

  return (
    <div className={cn("flex flex-col gap-3", compact ? "" : "rounded-[20px] bg-platinum/60 p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void run("target")} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-platinum px-4 text-sm font-semibold text-carbon-black hover:bg-alabaster-grey disabled:opacity-50">
          {playing === "target" ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} Target
        </button>
        <button
          type="button"
          onClick={() => (status === "recording" ? stop() : void start())}
          disabled={status === "saving"}
          aria-label={status === "recording" ? "Stop recording" : "Record yourself"}
          className={cn("inline-flex min-h-11 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold text-white disabled:opacity-50", status === "recording" ? "bg-blushed-brick" : "bg-hunter-green hover:brightness-110")}
        >
          {status === "recording" ? <Square size={16} aria-hidden="true" /> : <Microphone size={16} aria-hidden="true" />}
          {status === "recording" ? `Stop ${formatDuration(elapsed)}` : status === "saving" ? "Saving" : "Record"}
        </button>
        {latest ? (
          <>
            <button type="button" onClick={() => void run("you", latest)} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-platinum px-4 text-sm font-semibold text-carbon-black hover:bg-alabaster-grey disabled:opacity-50">
              {playing === `you${latest.id}` ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} You
            </button>
            <button type="button" onClick={() => void run("ab", latest)} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-platinum px-4 text-sm font-semibold text-carbon-black hover:bg-alabaster-grey disabled:opacity-50">
              <SwapHorizontal size={16} aria-hidden="true" /> A/B
            </button>
          </>
        ) : null}
      </div>
      {status === "denied" ? <p className="text-sm text-iron-grey">The microphone is blocked for this site. Allow it in the browser&apos;s site settings to record.</p> : null}
      {status === "unsupported" ? <p className="text-sm text-iron-grey">This browser can&apos;t record audio. Try a current Chrome, Safari or Firefox.</p> : null}
      {!compact && takes.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Your takes">
          {takes.slice(0, 4).map((take, i) => (
            <li key={take.id} className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-1.5 text-sm text-iron-grey">
              <span>
                {i === 0 ? "Latest" : new Date(take.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDuration(take.durationMs)}
              </span>
              <span className="flex gap-1">
                <button type="button" onClick={() => void run("you", take)} aria-label="Play this take" className="rounded-[10px] p-2 hover:bg-alabaster-grey">
                  <Play size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => void deleteTakes([take.id])} aria-label="Delete this take" className="rounded-[10px] p-2 hover:bg-alabaster-grey">
                  <Trash size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
