// FILE: src/components/learn-hub/ShareCard.tsx
//
// A progress card as an image: streak, minutes and lessons, nothing personal.
// Drawn on a canvas in the browser; shared with the system share sheet where
// there is one, downloaded otherwise.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CEFR_LEVELS } from "@/lib/platform/content-model.ts";
import type { ProgressSummary } from "@/lib/platform/progress-model.ts";

export function drawShareCard(summary: ProgressSummary, streak: number): HTMLCanvasElement {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#386641";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(size - 140, 140, 260, 0, Math.PI * 2);
  ctx.fill();

  const font = (weight: number, px: number) => `${weight} ${px}px "Funnel Display", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = font(700, 56);
  ctx.fillText("Cadence", 90, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 260);
  ctx.fillText(String(streak), 90, 520);
  ctx.font = font(600, 64);
  ctx.fillText(streak === 1 ? "day streak" : "day streak", 90, 610);

  const lessons = CEFR_LEVELS.reduce((sum, level) => sum + (summary.lessonsCompleted[level] ?? 0), 0);
  const stats = [
    [`${summary.totalMinutes}`, "minutes practised"],
    [`${summary.recent.length}`, "recent sessions"],
    [`${lessons}`, "lessons finished"],
  ];
  stats.forEach(([value, label], i) => {
    const x = 90 + i * 320;
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, 88);
    ctx.fillText(value, x, 820);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = font(500, 36);
    ctx.fillText(label, x, 870);
  });
  ctx.font = font(500, 34);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("cadence.pstepanov.dev", 90, 1000);
  return canvas;
}

export function ShareCardButton({ summary, streak }: { summary: ProgressSummary; streak: number }) {
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const canvas = drawShareCard(summary, streak);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const file = new File([blob], "cadence-progress.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Cadence progress" }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "cadence-progress.png";
        link.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={() => void share()} disabled={busy}>
      {busy ? "Making image…" : "Share progress"}
    </Button>
  );
}
