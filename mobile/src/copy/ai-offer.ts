// What the app says when an AI request cannot run (docs/PLATFORM.md,
// section 6). Short, plain, and never framed as a way around paying: your own
// Cadence server is offered as the open-source option it is. Pure; tested in
// tests/ai-offer.test.ts.
import type { BlockReason, LocalNote, Offer } from "../platform/engine-routing.ts";

export function blockMessage(reason: BlockReason, note?: LocalNote): string {
  const away = note === "local_unreachable" ? "Your Cadence server isn't reachable right now. " : "";
  switch (reason) {
    case "daily_limit":
      return "Daily limit reached. Connect your own Cadence for unlimited practice.";
    case "cloud_paused":
      return `${away}Cloud practice is paused for today. Try again later.`;
    case "needs_plus":
      return `${away}This uses AI. Run it on your own Cadence server, or with Cadence Plus in the cloud.`;
    case "needs_sign_in":
      return `${away}This uses AI. Run it on your own Cadence server, or sign in to use the cloud.`;
    case "cloud_unavailable":
      return note === "local_unreachable"
        ? "Your Cadence server isn't reachable. Check that it's running and on the same Wi-Fi."
        : "This uses AI. Connect your own Cadence server to use it.";
  }
}

export function offerLabel(offer: Offer): string {
  switch (offer) {
    case "connect_own_server":
      return "Connect your own Cadence server";
    case "reconnect_own_server":
      return "Reconnect your server";
    case "sign_in":
      return "Sign in";
    case "plus":
      return "Get Cadence Plus";
    case "retry_later":
      return "Try again later";
  }
}
