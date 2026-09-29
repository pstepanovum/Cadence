import { useQuery } from "@tanstack/react-query";
import { getAssessReadiness, getCoachReadiness } from "@/api/endpoints";
import { useConnection } from "@/pairing/context";

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
  refresh: () => void;
}

export function useAssessReadiness(enabled = true): EngineReadiness {
  const { mode, state } = useConnection();
  // No point polling an engine we have no route to.
  const connected = mode !== "local" || state.status === "connected";

  const query = useQuery({
    queryKey: ["readiness", "assess"],
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

  return {
    ready,
    warming: !ready && !offline && (data?.warming ?? false),
    offline,
    checking: connected && query.isLoading,
    message: ready
      ? null
      : !connected
        ? "Cadence is not connected to a server, so there is nothing to score against yet."
        : offline
          ? "Cadence can't reach the pronunciation engine right now. Recording will unlock as soon as it is back."
          : (data?.message ??
            "The pronunciation engine is warming up. Recording unlocks as soon as it is ready."),
    refresh: () => {
      query.refetch();
    },
  };
}

export function useCoachReadiness(enabled = true): EngineReadiness {
  const { mode, state } = useConnection();
  const connected = mode !== "local" || state.status === "connected";

  const query = useQuery({
    queryKey: ["readiness", "coach"],
    queryFn: getCoachReadiness,
    enabled: enabled && connected,
    refetchInterval: (current) => (current.state.data?.ready ? false : COACH_POLL_MS),
    retry: false,
    staleTime: 0,
  });

  const data = query.data;
  const ready = connected && data?.ready === true;
  const offline = !connected || query.isError;

  return {
    ready,
    warming: !ready && !offline,
    offline,
    checking: connected && query.isLoading,
    message: ready
      ? null
      : !connected
        ? "Cadence is not connected to a server, so the coach has nowhere to answer from."
        : offline
          ? "Cadence can't reach the coach right now. Check your connection and try again."
          : (data?.message ?? "The coach is warming up. This can take a minute on a cold start."),
    refresh: () => {
      query.refetch();
    },
  };
}
