import { useQuery } from "@tanstack/react-query";
import { getAssessReadiness, getCoachReadiness } from "@/api/endpoints";
import { blockMessage } from "@/copy/ai-offer";
import { useEngineRoute } from "@/engine/useEngineRoute";
import { useConnection } from "@/pairing/context";
import type { RouteDecision } from "@/platform/engine-routing";

// The Python engines load their models lazily, so the first request after a
// cold start can take a minute. The web app polls readiness every few seconds
// and keeps the record button disabled with visible copy until it clears; this
// is the same idea, so a learner never taps a dead microphone.

const POLL_MS = 4_000;
const COACH_POLL_MS = 5_000;

export interface EngineReadiness {
  /** Safe to record and score. */
  ready: boolean;
  /** The engine answered but is still loading its models. */
  warming: boolean;
  /** The engine could not be reached at all. */
  offline: boolean;
  checking: boolean;
  /** One line to show the learner. Null once everything is ready. */
  message: string | null;
  /** Set when the engine router says this cannot run here: show the offer instead. */
  blocked: Extract<RouteDecision, { route: "blocked" }> | null;
  refresh: () => void;
}

export function useAssessReadiness(enabled = true): EngineReadiness {
  const { mode, state } = useConnection();
  const route = useEngineRoute("score");
  const blocked = route.route === "blocked" ? route : null;
  // No point polling an engine we have no route to.
  const connected = (mode !== "local" || state.status === "connected") && !blocked;

  const query = useQuery({
    // Keyed by where the request goes: the home server and the cloud warm up separately.
    queryKey: ["readiness", "assess", route.route],
    queryFn: getAssessReadiness,
    enabled: enabled && connected,
    // Keep polling until it is ready, then stop.
    refetchInterval: (current) => (current.state.data?.ready ? false : POLL_MS),
    retry: false,
    staleTime: 0,
  });

  const data = query.data;
  const ready = connected && data?.ready === true;
  // A thrown query means we never reached the Next.js app at all.
  const offline = !connected || query.isError || data?.reachable === false;

  if (blocked) return blockedReadiness(blocked, () => void query.refetch());

  return {
    ready,
    blocked: null,
    warming: !ready && !offline && (data?.warming ?? false),
    offline,
    checking: connected && query.isLoading,
    message: ready
      ? null
      : !connected
        ? "Cadence is not connected to a server, so there is nothing to score against yet."
        : offline
          ? "Cadence can't reach the pronunciation engine right now."
          : (data?.message ??
            "The pronunciation engine is warming up."),
    refresh: () => {
      query.refetch();
    },
  };
}

export function useCoachReadiness(enabled = true): EngineReadiness {
  const { mode, state } = useConnection();
  const route = useEngineRoute("coach");
  const blocked = route.route === "blocked" ? route : null;
  const connected = (mode !== "local" || state.status === "connected") && !blocked;

  const query = useQuery({
    queryKey: ["readiness", "coach", route.route],
    queryFn: getCoachReadiness,
    enabled: enabled && connected,
    refetchInterval: (current) => (current.state.data?.ready ? false : COACH_POLL_MS),
    retry: false,
    staleTime: 0,
  });

  const data = query.data;
  const ready = connected && data?.ready === true;
  const offline = !connected || query.isError;
  const warming = !ready && !offline && data?.warming === true;

  if (blocked) return blockedReadiness(blocked, () => void query.refetch());

  return {
    ready,
    blocked: null,
    warming,
    offline,
    checking: connected && query.isLoading,
    // The server's own message is written for whoever runs it (it names
    // environment variables), so the learner gets plain copy instead.
    message: ready
      ? null
      : !connected
        ? "Cadence is not connected to a server, so the coach has nowhere to answer from."
        : offline
          ? "Cadence can't reach the coach right now. Check your connection and try again."
          : warming
            ? "The coach is warming up. This can take a minute on a cold start."
            : "The coach isn't available right now. It unlocks as soon as it's running.",
    refresh: () => {
      query.refetch();
    },
  };
}

function blockedReadiness(blocked: Extract<RouteDecision, { route: "blocked" }>, refresh: () => void): EngineReadiness {
  return {
    ready: false,
    warming: false,
    offline: false,
    checking: false,
    message: blockMessage(blocked.reason, blocked.note),
    blocked,
    refresh,
  };
}
