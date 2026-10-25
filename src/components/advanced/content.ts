// FILE: src/components/advanced/content.ts
//
// The phrase bank, slang and plateau packs in the browser (docs/PLATFORM.md
// sections 17 and 18): read from /packs once per page load (the service
// worker keeps them offline), with each item's pre-generated audio URL when
// the pack holds it. Free for everyone, every mode.
"use client";

import { useEffect, useState } from "react";

import type { PackIndex, PackManifest } from "@/lib/platform/content-model.ts";
import type { FossilError } from "@/lib/platform/fossilization.ts";
import type { Phrase, SlangEntry } from "@/lib/platform/phrase-bank.ts";

export interface AdvancedContent {
  phrases: Phrase[];
  slang: SlangEntry[];
  slangCategories: { id: string; title: string }[];
  errors: FossilError[];
  /** Item id to the URL of its pre-generated audio. */
  audio: Record<string, string>;
}

const EMPTY: AdvancedContent = { phrases: [], slang: [], slangCategories: [], errors: [], audio: {} };
let loading: Promise<AdvancedContent> | null = null;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

async function load(): Promise<AdvancedContent> {
  const index = await getJson<PackIndex>("/packs/index.json");
  const out: AdvancedContent = { phrases: [], slang: [], slangCategories: [], errors: [], audio: {} };
  const entries = (index?.packs ?? []).filter((p) => /^(phrases-[a-z0-9-]+|slang|fossilization)$/.test(p.id));
  await Promise.all(
    entries.map(async (entry) => {
      const base = `/packs/${entry.id}/v${entry.version}`;
      const manifest = await getJson<PackManifest>(`${base}/manifest.json`);
      if (!manifest) return;
      const audio = new Set(manifest.files.filter((f) => f.path.startsWith("audio/")).map((f) => f.path));
      const content = await getJson<{ phrases?: { phrases: Phrase[] }; slang?: { entries: SlangEntry[]; categories: { id: string; title: string }[] }; fossilization?: { errors: FossilError[] } }>(`${base}/content.json`);
      if (!content) return;
      for (const p of content.phrases?.phrases ?? []) {
        out.phrases.push(p);
        if (p.audio && audio.has(p.audio)) out.audio[p.id] = `${base}/${p.audio}`;
      }
      for (const s of content.slang?.entries ?? []) {
        out.slang.push(s);
        if (s.audio && audio.has(s.audio)) out.audio[s.id] = `${base}/${s.audio}`;
      }
      if (content.slang?.categories) out.slangCategories = content.slang.categories;
      out.errors.push(...(content.fossilization?.errors ?? []));
    }),
  );
  const levelOrder = ["B2", "C1", "C2"];
  out.phrases.sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level) || a.text.localeCompare(b.text));
  return out;
}

export function loadAdvancedContent(): Promise<AdvancedContent> {
  loading ??= load().catch(() => {
    loading = null;
    return EMPTY;
  });
  return loading;
}

/** The advanced content, or null while it loads. */
export function useAdvancedContent(): AdvancedContent | null {
  const [content, setContent] = useState<AdvancedContent | null>(null);
  useEffect(() => {
    let alive = true;
    void loadAdvancedContent().then((c) => {
      if (alive) setContent(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return content;
}
