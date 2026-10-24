// The widgets exist only on iOS; Metro loads sync.ios.ts there. This is the
// no-op for Android and the web.
import type { CadenceWidgetSnapshot } from "@/lib/widget/snapshot";

export const APP_GROUP = "group.dev.pstepanov.cadence";

export function syncWidget(snapshot: CadenceWidgetSnapshot): void {
  void snapshot;
}

export function clearWidget(): void {}

export const WIDGET_SUPPORTED = false;
