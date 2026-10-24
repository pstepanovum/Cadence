// React hooks over the engagement rules: today's streak and goal, the
// badges, and the content facts the level and grammar badges need.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { installedPacks, loadPack } from "@/content/packs";
import { buildBadges, type Badge, type ContentFacts } from "@/engagement/badges";
import { todayStatus, type TodayStatus } from "@/engagement/today";
import { today as todayKey, useLearning } from "@/learning/store";
import { usePrefs } from "@/lib/prefs";
import type { CefrLevel } from "@/platform/content-model";

const EMPTY_FACTS: ContentFacts = { lessonsByLevel: {}, topics: [] };

async function loadFacts(): Promise<ContentFacts> {
  const packs = (await installedPacks()).filter((pack) => pack.level);
  const lessonsByLevel: Partial<Record<CefrLevel, string[]>> = {};
  const topics = new Map<string, { id: string; title: string; grammarPointIds: string[] }>();
  for (const pack of packs) {
    const content = await loadPack(pack.id).catch(() => null);
    if (!content || !pack.level) continue;
    lessonsByLevel[pack.level] = [...(lessonsByLevel[pack.level] ?? []), ...content.lessons.map((lesson) => lesson.id)];
    for (const topic of content.topics) {
      const entry = topics.get(topic.id) ?? { id: topic.id, title: topic.title, grammarPointIds: [] };
      for (const point of content.grammarPoints) if (point.topicId === topic.id && !entry.grammarPointIds.includes(point.id)) entry.grammarPointIds.push(point.id);
      topics.set(topic.id, entry);
    }
  }
  return { lessonsByLevel, topics: [...topics.values()] };
}

export function useContentFacts(): ContentFacts {
  const query = useQuery({ queryKey: ["packs", "facts"], queryFn: loadFacts, staleTime: Infinity });
  return query.data ?? EMPTY_FACTS;
}

/** Today's local day, moving on at midnight and when the app comes back. */
export function useTodayKey(): string {
  const [day, setDay] = useState(() => todayKey());
  useEffect(() => {
    const check = () => setDay(todayKey());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime() - now.getTime();
    const timer = setTimeout(check, midnight);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [day]);
  return day;
}

export function useToday(): TodayStatus {
  const { state } = useLearning();
  const { dailyGoal } = usePrefs();
  const day = useTodayKey();
  return todayStatus(state, day, dailyGoal);
}

export function useBadges(): Badge[] {
  const { state } = useLearning();
  const facts = useContentFacts();
  const today = useToday();
  return buildBadges({ state, bestStreak: today.streak.best, facts });
}
