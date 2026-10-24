// Progress sync with the signed-in account (docs/PLATFORM.md, sections 4.1
// and 5.1). Free accounts send only summary activities; Plus also uploads its
// device detail once (on upgrade), then pushes changes and pulls other
// devices' changes, last writer wins. Every step is best effort: offline, the
// queue waits on the phone and the next sync sends it.
import { ackInbox, getInbox, syncImport, syncPull, syncPush, syncSummary } from "@/api/account";
import { getInstallId } from "@/lib/install-id";
import type { DataTier } from "@/platform/engine-routing";
import type { ProgressSummary } from "@/platform/progress-model";

import {
  addCustomCards,
  afterSummarySync,
  detailSince,
  mergeRemoteDetail,
  summaryBatch,
  type RemoteDetail,
} from "./state.ts";
import { getLearning, updateLearning } from "./store.ts";

let running: Promise<void> | null = null;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

async function syncOnce(tier: DataTier): Promise<void> {
  if (tier === "none") return;
  const start = getLearning();
  if (!start.loaded || !start.learner) return;
  const learner = start.learner;
  const still = () => getLearning().learner === learner;

  // Summary: send what is queued (or nothing, which fetches the account's
  // summary from other devices) and take the server's copy.
  const batch = summaryBatch(start.state);
  const result = await syncSummary(batch);
  if (!still()) return;
  const summary = isObject(result) && isObject(result.summary) ? (result.summary as unknown as ProgressSummary) : null;
  updateLearning((s) => afterSummarySync(s, batch.length, summary));

  // Cards added through the MCP connector, delivered once.
  const inbox = await getInbox();
  if (inbox.length && still()) {
    updateLearning((s) => addCustomCards(s, inbox, Date.now()).state);
    const ids = inbox.map((card) => card.id).filter((id): id is string => typeof id === "string");
    await ackInbox(ids);
  }

  if (tier !== "full" || !still()) return;

  const installId = await getInstallId();
  const state = getLearning().state;
  const now = Date.now();
  if (state.sync.importedAt === null) {
    // First sync with Plus on this phone: upload what it has, once.
    const detail = detailSince(state, 0);
    await syncImport({ installId, srs: detail.cards, attempts: detail.attempts, mastery: { sounds: detail.sounds, grammar: detail.grammar } });
    updateLearning((s) => ({ ...s, sync: { ...s.sync, importedAt: now, pushedAt: now } }));
  } else {
    const detail = detailSince(state, state.sync.pushedAt);
    const changed = Object.keys(detail.cards).length + Object.keys(detail.sounds).length + Object.keys(detail.grammar).length + detail.attempts.length;
    if (changed > 0) {
      await syncPush({ installId, srs: detail.cards, attempts: detail.attempts, mastery: { sounds: detail.sounds, grammar: detail.grammar } });
      updateLearning((s) => ({ ...s, sync: { ...s.sync, pushedAt: now } }));
    }
  }

  const pulled = await syncPull(getLearning().state.sync.pullCursor);
  if (!still()) return;
  const mastery = isObject(pulled.mastery) ? pulled.mastery : {};
  const remote: RemoteDetail = {
    cards: isObject(pulled.srs) ? (pulled.srs as RemoteDetail["cards"]) : undefined,
    sounds: isObject(mastery.sounds) ? (mastery.sounds as RemoteDetail["sounds"]) : undefined,
    grammar: isObject(mastery.grammar) ? (mastery.grammar as RemoteDetail["grammar"]) : undefined,
  };
  const cursor = typeof pulled.cursor === "string" ? pulled.cursor : null;
  updateLearning((s) => ({ ...mergeRemoteDetail(s, remote), sync: { ...s.sync, pullCursor: cursor ?? s.sync.pullCursor } }));
}

/** Runs one sync, or joins the one already running. Never throws. */
export function syncProgress(tier: DataTier): Promise<void> {
  running ??= syncOnce(tier)
    .catch(() => {
      // Offline or the server is busy; the queue is still on the phone.
    })
    .finally(() => {
      running = null;
    });
  return running;
}
