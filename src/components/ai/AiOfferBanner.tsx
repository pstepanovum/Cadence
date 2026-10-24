// FILE: src/components/ai/AiOfferBanner.tsx
//
// Shown when the server refuses a cloud AI request: says why in plain words
// and offers the way forward, connecting your own Cadence (free, unlimited)
// side by side with Plus. Practice without AI is untouched.
"use client";

import { useEffect, useState } from "react";
import { AI_BLOCKED_EVENT, type AiBlockedDetail } from "@/hooks/cloud-fetch";
import { Button } from "@/components/ui/button";

const TITLES: Record<string, string> = {
  needs_plus: "AI practice needs Plus or your own Cadence",
  needs_sign_in: "Sign in for cloud AI, or use your own Cadence",
  daily_limit: "Daily limit reached",
  cloud_paused: "Cloud AI is paused for today",
  cloud_unavailable: "Connect your own Cadence for AI practice",
};

export function AiOfferBanner() {
  const [detail, setDetail] = useState<AiBlockedDetail | null>(null);

  useEffect(() => {
    const onBlocked = (event: Event) => setDetail((event as CustomEvent<AiBlockedDetail>).detail);
    window.addEventListener(AI_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(AI_BLOCKED_EVENT, onBlocked);
  }, []);

  if (!detail) return null;
  const offers = new Set(detail.offers.length ? detail.offers : ["connect_own_server"]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6" role="dialog" aria-live="polite" aria-label={TITLES[detail.reason] ?? "AI practice"}>
      <div className="mx-auto max-w-3xl rounded-3xl bg-hunter-green px-5 py-5 text-white shadow-[0_18px_48px_rgba(0,0,0,0.25)] sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-kicker text-xl">{TITLES[detail.reason] ?? "AI practice"}</p>
            <p className="mt-1 text-sm leading-6 text-white/85">
              {detail.message || "Daily limit reached. Connect your own Cadence for unlimited practice."} Lessons, quizzes and flashcards still work.
            </p>
          </div>
          <button type="button" onClick={() => setDetail(null)} aria-label="Close" className="h-11 w-11 shrink-0 cursor-pointer rounded-full bg-white/10 text-lg">
            ×
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {offers.has("connect_own_server") || offers.has("reconnect_own_server") ? (
            <Button variant="secondary" href="/connect-phone">
              {offers.has("reconnect_own_server") ? "Reconnect your Cadence" : "Connect your own Cadence"}
            </Button>
          ) : null}
          {offers.has("plus") ? <Button href="/pricing" className="bg-white/10 text-white">See Cadence Plus</Button> : null}
          {offers.has("sign_in") ? <Button href="/login" className="bg-white/10 text-white">Sign in</Button> : null}
          <Button href="/practice" className="bg-white/10 text-white">Practise without AI</Button>
        </div>
      </div>
    </div>
  );
}
