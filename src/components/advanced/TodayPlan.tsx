// FILE: src/components/advanced/TodayPlan.tsx
//
// Today on the web: the daily plan (buildDailyPlan, docs/PLATFORM.md section
// 7) from what this browser knows (due flashcards, sounds to fix, the plateau
// track and phrase reviews), and the advanced drill list (buildPracticeDay)
// with where to start each part.
"use client";

import { useEffect, useMemo } from "react";

import { SRS_KEY } from "@/components/learn-hub/sync";
import { loadSoundStore } from "@/components/mouth-map/sound-store";
import { Button } from "@/components/ui/button";
import { buildDailyPlan, type PlanItem } from "@/lib/platform/daily-plan.ts";
import { dailyDrills, retestDue } from "@/lib/platform/fossilization.ts";
import { buildPracticeDay } from "@/lib/platform/practice-day.ts";
import { useAdvancedContent } from "./content";
import { syncAdvanced, today, useAdvancedState } from "./store";
import { AdvancedNav, Loading, PageHead, Surface, Tag } from "./ui";

const REASON_LABELS = { assigned: "Assigned", due: "Review", new: "New", plateau: "Plateau" } as const;

function planLabel(item: PlanItem): { title: string; href: string } {
  switch (item.kind) {
    case "flashcards":
      return { title: `${item.cardIds.length} flashcards due`, href: "/practice/flashcards" };
    case "plateau":
      return { title: item.retest ? "Plateau track: this week's re-test" : "Plateau track: today's drills", href: "/plateau" };
    case "phrases":
      return { title: `${item.itemIds.length} phrases and slang to review`, href: "/phrases/practice" };
    case "sound":
      return { title: `Sound to fix: ${item.soundId.replace("sound.", "")}`, href: `/sounds/${item.soundId}` };
    case "grammar":
      return { title: "A weak grammar point", href: "/grammar" };
    case "shadowing":
      return { title: "Shadowing", href: "/phrases/practice" };
    case "coach":
      return { title: "A conversation with the coach", href: "/coach" };
    case "lesson":
      return { title: `A ${item.level} lesson`, href: `/practice?level=${item.level}` };
  }
}

export function TodayPlan() {
  const content = useAdvancedContent();
  const state = useAdvancedState();
  useEffect(() => {
    void syncAdvanced();
  }, []);
  const day = today();

  const result = useMemo(() => {
    if (!content) return null;
    const practice = buildPracticeDay({ day, phrases: content.phrases, slang: content.slang, cards: state.cards, list: state.list, track: state.track, catalog: content.errors });
    let flashcards: { cardId: string; due: string }[] = [];
    try {
      const raw = JSON.parse(window.localStorage.getItem(SRS_KEY) ?? "{}") as Record<string, { due?: string }>;
      flashcards = Object.entries(raw).filter(([, c]) => typeof c.due === "string" && c.due !== "").map(([cardId, c]) => ({ cardId, due: c.due! }));
    } catch {
      flashcards = [];
    }
    let sounds: { soundId: string; ema: number; attempts: number }[] = [];
    try {
      sounds = Object.entries(loadSoundStore()).map(([soundId, r]) => ({ soundId, ema: r.ema, attempts: r.attempts }));
    } catch {
      sounds = [];
    }
    const plan = buildDailyPlan({
      today: day,
      dueCards: flashcards,
      sounds,
      grammar: [],
      level: null,
      aiAvailable: false,
      plateau: state.track ? { steps: dailyDrills(state.track, content.errors, day).length, retestDue: retestDue(state.track, day) !== null } : null,
      dueItems: Object.entries(state.cards).map(([itemId, c]) => ({ itemId, due: c.due })).filter((c) => c.due),
    });
    return { practice, plan };
  }, [content, state, day]);

  if (!content || !result) return <Loading label="Building today" />;
  const { practice, plan } = result;

  return (
    <div className="flex flex-col gap-5">
      <AdvancedNav />
      <PageHead eyebrow="Today" title={`${plan.minutes} minutes that matter`}>
        Built from what is due and what still slips: reviews first, then your plateau drills, then new material.
      </PageHead>
      <Surface className="flex flex-col gap-2">
        <p className="font-semibold text-carbon-black">Your plan</p>
        <ol className="flex flex-col gap-1">
          {plan.items.map((item, i) => {
            const { title, href } = planLabel(item);
            return (
              <li key={`${item.kind}-${i}`} className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 hover:bg-platinum">
                <a href={href} className="font-semibold text-carbon-black">
                  {title}
                </a>
                <span className="text-sm text-slate-grey">{item.minutes} min</span>
              </li>
            );
          })}
        </ol>
      </Surface>
      <Surface className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-carbon-black">Phrases, slang and drills</p>
          <span className="flex gap-1">
            {(Object.keys(REASON_LABELS) as (keyof typeof REASON_LABELS)[]).filter((r) => practice.counts[r]).map((r) => (
              <Tag key={r}>{`${practice.counts[r]} ${REASON_LABELS[r].toLowerCase()}`}</Tag>
            ))}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {practice.items.slice(0, 12).map((item) => (
            <li key={item.itemId} className="flex items-start justify-between gap-3 rounded-[12px] px-3 py-2">
              <span className="min-w-0">
                <span className="block text-base text-carbon-black">{item.say}</span>
                <span className="block text-sm text-iron-grey">{item.meaning}</span>
              </span>
              <Tag tone={item.reason === "due" ? "green" : "grey"}>{REASON_LABELS[item.reason]}</Tag>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button href="/phrases/practice">Start phrases</Button>
          <Button variant="secondary" href="/slang/quiz">
            Slang quiz
          </Button>
          <Button variant="secondary" href="/plateau">
            Plateau track
          </Button>
        </div>
      </Surface>
    </div>
  );
}
