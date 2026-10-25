// The phrase bank, slang and plateau packs on the phone (docs/PLATFORM.md
// sections 17 and 18). They ship inside the app (mobile/scripts/sync-content.mjs
// bundles them), so all of it works offline and with no account. Read from
// disk the first time a screen needs them, then kept in memory.
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";

import { BUNDLED_PACKS } from "@/content/bundled.generated";
import type { FossilError } from "@/platform/fossilization";
import type { Phrase, SlangEntry } from "@/platform/phrase-bank";

export interface AdvancedContent {
  phrases: Phrase[];
  slang: SlangEntry[];
  slangCategories: { id: string; title: string }[];
  errors: FossilError[];
  /** Item id to the bundled audio module's pack and path, when the pack holds its audio. */
  audio: Record<string, { packId: string; path: string }>;
}

const EMPTY: AdvancedContent = { phrases: [], slang: [], slangCategories: [], errors: [], audio: {} };
const ADVANCED_PACK = /^(phrases-[a-z0-9-]+|slang|fossilization)$/;
let loading: Promise<AdvancedContent> | null = null;
let loaded: AdvancedContent | null = null;

async function readBundled(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (!asset.localUri) await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).text();
}

type Body = { phrases?: { phrases: Phrase[] }; slang?: { entries: SlangEntry[]; categories: { id: string; title: string }[] }; fossilization?: { errors: FossilError[] } };

async function load(): Promise<AdvancedContent> {
  const out: AdvancedContent = { phrases: [], slang: [], slangCategories: [], errors: [], audio: {} };
  for (const pack of BUNDLED_PACKS.filter((p) => ADVANCED_PACK.test(p.id))) {
    let body: Body;
    try {
      body = JSON.parse(await readBundled(pack.content)) as Body;
    } catch {
      continue;
    }
    for (const phrase of body.phrases?.phrases ?? []) {
      out.phrases.push(phrase);
      if (phrase.audio && pack.audio[phrase.audio] !== undefined) out.audio[phrase.id] = { packId: pack.id, path: phrase.audio };
    }
    for (const entry of body.slang?.entries ?? []) {
      out.slang.push(entry);
      if (entry.audio && pack.audio[entry.audio] !== undefined) out.audio[entry.id] = { packId: pack.id, path: entry.audio };
    }
    if (body.slang?.categories) out.slangCategories = body.slang.categories;
    out.errors.push(...(body.fossilization?.errors ?? []));
  }
  const order = ["B2", "C1", "C2"];
  out.phrases.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || a.text.localeCompare(b.text));
  return out;
}

export function loadAdvancedContent(): Promise<AdvancedContent> {
  loading ??= load()
    .then((content) => {
      loaded = content;
      return content;
    })
    .catch(() => {
      loading = null;
      return EMPTY;
    });
  return loading;
}

/** The content, or null while it is read for the first time. */
export function useAdvancedContent(): AdvancedContent | null {
  const [content, setContent] = useState<AdvancedContent | null>(loaded);
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    void loadAdvancedContent().then((c) => alive && setContent(c));
    return () => {
      alive = false;
    };
  }, []);
  return content;
}
