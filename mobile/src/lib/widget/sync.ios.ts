// Hands today's streak, goal and words to the widgets through the App Group
// both targets share (read by mobile/targets/widget/Snapshot.swift), then asks
// WidgetKit to redraw. Never throws: a widget is a nicety.
import { ExtensionStorage } from "@bacons/apple-targets";

import type { CadenceWidgetSnapshot } from "@/lib/widget/snapshot";

/** Must match `appGroup` in Snapshot.swift and the entitlement in app.json. */
export const APP_GROUP = "group.dev.pstepanov.cadence";
const SNAPSHOT_KEY = "cadence.widget.snapshot";
const KINDS = ["CadenceStreakWidget", "CadenceWordWidget"];

const storage = new ExtensionStorage(APP_GROUP);
let lastWritten: string | null = null;

function reload() {
  try {
    for (const kind of KINDS) ExtensionStorage.reloadWidget(kind);
  } catch {
    // The extension may be missing from a development build.
  }
}

export function syncWidget(snapshot: CadenceWidgetSnapshot): void {
  try {
    // `updatedAt` alone is no reason to redraw.
    const key = JSON.stringify({ ...snapshot, updatedAt: 0 });
    if (key === lastWritten) return;
    storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
    lastWritten = key;
    reload();
  } catch {
    // Ignored: see above.
  }
}

export function clearWidget(): void {
  try {
    storage.remove(SNAPSHOT_KEY);
    lastWritten = null;
    reload();
  } catch {
    // Ignored.
  }
}

export const WIDGET_SUPPORTED = true;
