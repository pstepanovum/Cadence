// The engine router on the phone: before any AI action, decide where it runs
// (docs/PLATFORM.md, section 6). A reachable paired Cadence server first,
// free for everyone; then the cloud for Plus, within today's quota; otherwise
// the offers. The server applies the same rules again.
import { useAccount } from "@/context/account";
import { useConnection } from "@/pairing/context";
import { AI_CAPABILITIES, routeRequest, type AiCapability, type RouteDecision } from "@/platform/engine-routing";

export function useEngineRoute(capability: AiCapability): RouteDecision {
  const { paired, state, mode } = useConnection();
  const account = useAccount();
  return routeRequest({
    capability,
    local: { paired, reachable: state.status === "connected", capabilities: AI_CAPABILITIES },
    signedIn: account.signedIn,
    plus: account.plus,
    cloud: {
      // In own-server mode there is no cloud at all, so nothing offers Plus.
      configured: mode === "cloud" && account.cloudAvailable,
      paused: account.me?.cloudPaused ?? false,
      quotaLeft: account.quotaLeft(capability),
    },
  });
}
