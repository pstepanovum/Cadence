import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Linking } from "react-native";
import { getHealth } from "@/api/endpoints";
import { OFFLINE_MESSAGE } from "@/copy/errors";
import { useConnection } from "@/pairing/context";
import { describeFailure } from "@/pairing/errors";

/**
 * Whether the server this build is talking to can be reached right now.
 *
 * There are two answers depending on the mode the connection layer is in:
 *
 * - **local**: the paired computer on the Wi-Fi. The connection layer already
 *   sweeps for it and knows exactly what went wrong, so its state is used
 *   verbatim rather than probed again from here.
 * - **cloud**: the hosted API. `/api/health` needs no auth and returns a couple
 *   of bytes, which makes it the cheapest honest answer.
 *
 * Screens use this to tell a genuine outage apart from an empty account, so an
 * unreachable server says "can't reach Cadence" instead of "you have no
 * modules".
 */
export interface ServerStatus {
  reachable: boolean;
  checking: boolean;
  /**
   * Known to be unreachable: not reachable and no check running. A screen
   * showing `ServerBanner` hides its own load errors while this is true.
   */
  offline: boolean;
  /** Null while reachable. */
  message: string | null;
  /** Label for the recovery button, when one makes sense. */
  actionLabel: string | null;
  /** What the recovery button does: retry, rescan, open Settings or pair. */
  action: () => void;
  /** Checks again. Pull-to-refresh calls this; it never navigates. */
  refresh: () => void;
}

export function useServerStatus(): ServerStatus {
  const status = useServerStatusBase();
  return { ...status, offline: !status.reachable && !status.checking };
}

function useServerStatusBase(): Omit<ServerStatus, "offline"> {
  const { mode, state, reconnect } = useConnection();
  const isLocal = mode === "local";

  const query = useQuery({
    queryKey: ["server-health"],
    queryFn: getHealth,
    // In local mode the connection layer is the authority; do not double-probe.
    enabled: !isLocal,
    retry: false,
    staleTime: 15_000,
    refetchInterval: (current) => (current.state.data?.ok ? false : 10_000),
  });

  if (isLocal) {
    switch (state.status) {
      case "connected":
        return {
          reachable: true,
          checking: false,
          message: null,
          actionLabel: null,
          action: reconnect,
          refresh: reconnect,
        };
      case "connecting":
        return {
          reachable: false,
          checking: true,
          message: "Looking for your computer on this network…",
          actionLabel: null,
          action: reconnect,
          refresh: reconnect,
        };
      case "offline": {
        const described = describeFailure(state.failure);
        const action =
          described.actionKind === "settings"
            ? () => void Linking.openSettings()
            : described.actionKind === "rescan"
              ? () => router.push("/connect/scan")
              : reconnect;
        return {
          reachable: false,
          checking: false,
          message: `${described.title}. ${described.body}`,
          actionLabel: described.action,
          action,
          refresh: reconnect,
        };
      }
      case "unpaired":
      default:
        return {
          reachable: false,
          checking: false,
          message: "This phone is not paired with a computer yet.",
          actionLabel: "Connect",
          action: () => router.push("/connect"),
          refresh: reconnect,
        };
    }
  }

  const reachable = query.data?.ok === true;
  const refresh = () => {
    void query.refetch();
  };
  return {
    reachable,
    checking: query.isLoading,
    message: reachable ? null : OFFLINE_MESSAGE,
    actionLabel: reachable ? null : "Try again",
    action: refresh,
    refresh,
  };
}

// The wording itself lives in src/copy/errors.ts, free of React imports so it
// can be unit tested; re-exported here because every screen already imports it
// alongside `useServerStatus`.
export { describeError } from "@/copy/errors";
