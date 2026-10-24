// FILE: mobile/src/pairing/context.tsx
//
// The runtime around discovery.ts: it owns the timers, the fetches and the
// keychain, and keeps a single source of truth for "where do API calls go right
// now, and what do I tell the person if they go nowhere".
//
// Mode is explicit. The app is either talking to a computer on the Wi-Fi
// (local) or to the hosted service (cloud), never guessing between them, which
// mirrors how the web app models it in src/lib/app-mode.ts.
import { useQueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut } from "firebase/auth";
import { AppState } from "react-native";

import { setTransport } from "@/api/transport";
import { config } from "@/lib/config";
import { getFirebaseAuth } from "@/lib/firebase";
import { claimPairing, probeServer, verifySession } from "@/pairing/client";
import {
  buildCandidates,
  isExpectedServer,
  reduce,
  rememberGoodAddress,
  retryDelayMs,
  type ConnectionState,
  type StoredConnection,
} from "@/pairing/discovery";
import type { ConnectionFailure } from "@/pairing/errors";
import type { PairingPayload } from "@/pairing/protocol";
import {
  clearPairing,
  readPairing,
  updateStoredConnection,
  writePairing,
} from "@/pairing/storage";

export type AppMode = "local" | "cloud";

interface ConnectionValue {
  /** False until the keychain has been read; the splash stays up until then. */
  ready: boolean;
  /** null when the person has not chosen yet. */
  mode: AppMode | null;
  state: ConnectionState;
  connection: StoredConnection | null;
  /** Base URL for API calls in local mode, null when not connected. */
  baseUrl: string | null;
  deviceToken: string | null;
  chooseCloud: () => Promise<void>;
  pair: (payload: PairingPayload) => Promise<{ ok: true } | { ok: false; failure: ConnectionFailure }>;
  reconnect: () => void;
  forget: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionValue | null>(null);

const MODE_KEY = "cadence.pairing.mode";

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ConnectionState>({ status: "unpaired" });
  const [connection, setConnection] = useState<StoredConnection | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  // A sweep in flight must not be started twice (app resume plus a network
  // change often land together), and a stale sweep must not overwrite the
  // result of a newer one.
  const sweeping = useRef(false);
  const generation = useRef(0);
  const queryClient = useQueryClient();
  /** The last transport published, and whether one is published right now. */
  const lastTransportKey = useRef<string | null>(null);
  const transportLive = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((event: Parameters<typeof reduce>[1]) => {
    setState((current) => reduce(current, event));
  }, []);

  // --- Launch -------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await readPairing();

      if (cancelled) return;

      if (stored) {
        setConnection(stored.connection);
        setDeviceToken(stored.deviceToken);
        setMode("local");
        setState({ status: "connecting", attempt: 0, candidate: null });
      } else {
        // Cloud is remembered separately: it needs no keychain entry, only the
        // Firebase sign-in the auth context already restores.
        const { default: AsyncStorage } = await import(
          "@react-native-async-storage/async-storage"
        );
        const savedMode = await AsyncStorage.getItem(MODE_KEY);
        // A build without cloud config cannot honour a remembered cloud
        // choice, so it falls back to the connect screen instead.
        if (!cancelled && savedMode === "cloud" && config.isCloudConfigured) {
          setMode("cloud");
        }
      }

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Sweeping -----------------------------------------------------------

  const sweep = useCallback(async () => {
    if (sweeping.current || !connection || !deviceToken) {
      return;
    }

    sweeping.current = true;
    const run = ++generation.current;

    try {
      const network = await readNetwork();

      if (!network.hasNetwork || !network.isWifi) {
        if (run === generation.current) {
          dispatch({ type: "network_changed", network });
        }
        return;
      }

      for (const candidate of buildCandidates(connection)) {
        if (run !== generation.current) return;

        dispatch({ type: "probing", candidate });

        const probe = await probeServer(candidate);

        if (run !== generation.current) return;

        if (!probe.ok) {
          // A version mismatch is a property of the server, not of the
          // address, so there is no point trying the others.
          if (probe.failure === "server_too_new" || probe.failure === "server_too_old") {
            dispatch({ type: "probe_failed", failure: probe.failure });
            return;
          }
          continue;
        }

        if (!isExpectedServer(connection, probe.info)) {
          // Something else has taken this address. Keep looking rather than
          // handing our token to it.
          continue;
        }

        // Confirmed the right computer; only now does the token go on the wire.
        const session = await verifySession(candidate, deviceToken);

        if (run !== generation.current) return;

        if (!session.ok) {
          dispatch({ type: "probe_failed", failure: session.failure });
          if (session.failure === "device_revoked" || session.failure === "token_expired") {
            await clearPairing();
            setDeviceToken(null);
          }
          return;
        }

        const next = rememberGoodAddress(connection, candidate);
        if (next !== connection) {
          setConnection(next);
          void updateStoredConnection(next);
        }

        dispatch({ type: "probe_succeeded", baseUrl: candidate, info: probe.info });
        return;
      }

      if (run === generation.current) {
        dispatch({ type: "probe_failed", failure: "server_unreachable" });
      }
    } finally {
      sweeping.current = false;
    }
  }, [connection, deviceToken, dispatch]);

  // Kick a sweep whenever the machine says it wants one.
  useEffect(() => {
    if (state.status === "connecting" && state.candidate === null) {
      void sweep();
    }
  }, [state, sweep]);

  // Back off and try again after a failure the person has not acted on.
  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    if (state.status !== "offline" || state.retryInMs === null) {
      return;
    }

    retryTimer.current = setTimeout(() => {
      dispatch({ type: "connect_requested" });
    }, state.retryInMs ?? retryDelayMs(0));

    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [state, dispatch]);

  // A laptop that went to sleep is the common case, and the phone usually
  // notices when it comes back to the foreground.
  useEffect(() => {
    if (mode !== "local") return;

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        dispatch({ type: "connect_requested" });
      }
    });

    return () => subscription.remove();
  }, [mode, dispatch]);

  // Joining a different Wi-Fi invalidates the remembered address.
  useEffect(() => {
    if (mode !== "local") return;

    const subscription = Network.addNetworkStateListener(() => {
      dispatch({ type: "connect_requested" });
    });

    return () => subscription.remove();
  }, [mode, dispatch]);

  // --- Actions ------------------------------------------------------------

  const pair = useCallback(
    async (payload: PairingPayload) => {
      const result = await claimPairing(payload);

      if (!result.ok) {
        return { ok: false as const, failure: result.failure };
      }

      await writePairing({ deviceToken: result.deviceToken, connection: result.connection });

      // Local mode has no account. A cloud sign-in left behind would otherwise
      // keep authenticating any request made while the computer is away.
      const auth = getFirebaseAuth();
      if (auth?.currentUser) await signOut(auth).catch(() => {});

      setConnection(result.connection);
      setDeviceToken(result.deviceToken);
      setMode("local");
      generation.current += 1;
      setState(reduce(state, { type: "paired", connection: result.connection }));

      const { default: AsyncStorage } = await import(
        "@react-native-async-storage/async-storage"
      );
      await AsyncStorage.setItem(MODE_KEY, "local");

      return { ok: true as const };
    },
    [state],
  );

  const chooseCloud = useCallback(async () => {
    // A stored pairing wins at launch, so it has to go, or the next cold start
    // would put the phone back in local mode.
    generation.current += 1;
    await clearPairing();
    setConnection(null);
    setDeviceToken(null);
    setState({ status: "unpaired" });

    const { default: AsyncStorage } = await import(
      "@react-native-async-storage/async-storage"
    );
    await AsyncStorage.setItem(MODE_KEY, "cloud");
    setMode("cloud");
  }, []);

  const forget = useCallback(async () => {
    generation.current += 1;
    await clearPairing();
    setConnection(null);
    setDeviceToken(null);
    setMode(null);
    setState({ status: "unpaired" });

    const { default: AsyncStorage } = await import(
      "@react-native-async-storage/async-storage"
    );
    await AsyncStorage.removeItem(MODE_KEY);
  }, []);

  const reconnect = useCallback(() => {
    generation.current += 1;
    sweeping.current = false;
    dispatch({ type: "connect_requested" });
  }, [dispatch]);

  // Publish the active transport so the plain-function API layer knows where to
  // send calls. Cleared the moment the connection drops, so a screen that fires
  // a request while the computer is asleep fails fast instead of hanging.
  useEffect(() => {
    const transport =
      mode === "local"
        ? state.status === "connected"
          ? { mode: "local" as const, baseUrl: state.baseUrl, deviceToken }
          : null
        : mode === "cloud" && config.apiUrl
          ? { mode: "cloud" as const, baseUrl: config.apiUrl, deviceToken: null }
          : null;

    setTransport(transport);
    const wasLive = transportLive.current;
    transportLive.current = transport !== null;
    if (!transport) return;

    // Queries that ran while there was nowhere to send them hold a "not
    // connected" error until something refetches them. A different server or
    // credential means the cached data belongs to someone else's progress, so
    // it is dropped; the same one coming back just refetches.
    const key = `${transport.mode} ${transport.baseUrl} ${transport.deviceToken ?? ""}`;
    if (key === lastTransportKey.current) {
      if (wasLive) return;
      void queryClient.invalidateQueries();
    } else {
      if (lastTransportKey.current !== null) queryClient.removeQueries();
      void queryClient.refetchQueries({ type: "active" });
      lastTransportKey.current = key;
    }
  }, [mode, state, deviceToken, queryClient]);

  const value = useMemo<ConnectionValue>(
    () => ({
      ready,
      mode: ready ? mode : null,
      state,
      connection,
      baseUrl: state.status === "connected" ? state.baseUrl : null,
      deviceToken,
      chooseCloud,
      pair,
      reconnect,
      forget,
    }),
    [ready, mode, state, connection, deviceToken, chooseCloud, pair, reconnect, forget],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionValue {
  const value = useContext(ConnectionContext);
  if (!value) {
    throw new Error("useConnection must be used inside a ConnectionProvider.");
  }
  return value;
}

async function readNetwork(): Promise<{ hasNetwork: boolean; isWifi: boolean }> {
  try {
    const state = await Network.getNetworkStateAsync();
    return {
      hasNetwork: state.isConnected === true,
      // A LAN server is unreachable over cellular, so saying so beats a
      // timeout the person cannot interpret.
      isWifi:
        state.type === Network.NetworkStateType.WIFI ||
        state.type === Network.NetworkStateType.ETHERNET ||
        state.type === Network.NetworkStateType.VPN ||
        state.type === Network.NetworkStateType.UNKNOWN,
    };
  } catch {
    // If we cannot tell, assume we can reach the network and let the probe
    // decide; a wrong guess here would block a working connection.
    return { hasNetwork: true, isWifi: true };
  }
}
