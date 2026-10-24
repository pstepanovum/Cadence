// The signed-in account's entitlement and data tier, the store account that
// follows it, and the learner whose progress the phone keeps.
//
// - Plus comes from the server (GET /api/me), written there only by verified
//   webhooks. The store's own answer after a purchase lights up Plus on this
//   screen at once, while the server catches up.
// - After sign-in the store is pointed at the Firebase uid (Purchases.logIn),
//   and released on sign-out (logOut).
// - Progress syncs per tier: nothing without an account, the summary for a
//   free account, everything for Plus.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { getMe } from "@/api/account";
import { useAuth } from "@/context/auth";
import { setLearner, useLearning } from "@/learning/store";
import { syncProgress } from "@/learning/sync";
import { NO_STORE_STATUS, type StoreStatus } from "@/lib/billing/plans";
import { onStoreStatus, signInToStore, signOutOfStore } from "@/lib/billing/purchases";
import { config } from "@/lib/config";
import { parseMe, quotaLeftFor, type Me } from "@/lib/me";
import { useConnection } from "@/pairing/context";
import { dataTier, type AiCapability, type DataTier } from "@/platform/engine-routing";

interface AccountValue {
  /** Signed in to a cloud account (not just paired with a server). */
  signedIn: boolean;
  /** Plus is active, per the server or a purchase this phone just made. */
  plus: boolean;
  tier: DataTier;
  me: Me | null;
  meLoading: boolean;
  store: StoreStatus;
  /** Whether this build can offer cloud features at all. */
  cloudAvailable: boolean;
  quotaLeft: (capability: AiCapability) => number | null;
  refresh: () => void;
  /** Reports a purchase or restore: shows Plus at once and asks the server again. */
  noteStoreStatus: (status: StoreStatus) => void;
  syncNow: () => void;
}

const AccountContext = createContext<AccountValue | null>(null);

/** How often to ask the server again after a purchase, while its webhook arrives. */
const AFTER_PURCHASE_POLLS = [2_000, 5_000, 10_000, 20_000];

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { mode } = useConnection();
  const queryClient = useQueryClient();
  const cloud = mode === "cloud" && config.isCloudConfigured;
  const uid = cloud ? (user?.uid ?? null) : null;
  const signedIn = uid !== null;

  const meQuery = useQuery({
    queryKey: ["me", uid],
    queryFn: async () => parseMe(await getMe(), Date.now()),
    enabled: signedIn,
    staleTime: 60_000,
    retry: 1,
  });
  const me = signedIn ? (meQuery.data ?? null) : null;

  const [store, setStore] = useState<StoreStatus>(NO_STORE_STATUS);

  // The store follows the account: logIn after sign-in, logOut on sign-out.
  useEffect(() => {
    let active = true;
    if (!uid) {
      void signOutOfStore().catch(() => {});
      return;
    }
    signInToStore(uid)
      .then((status) => {
        if (active && status) setStore(status);
      })
      .catch(() => {});
    const unsubscribe = onStoreStatus((status) => {
      if (active) setStore(status);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);

  // The learner whose progress the phone keeps: the account, or this device
  // when practising on one's own server with no account.
  useEffect(() => {
    setLearner(uid ?? (mode === "local" ? "device" : null));
  }, [uid, mode]);

  const serverPlus = me?.plusActive ?? false;
  const storeShown = uid ? store : NO_STORE_STATUS;
  const plus = signedIn && (serverPlus || storeShown.active);
  // Detail syncs only once the server itself says Plus.
  const tier: DataTier = dataTier(signedIn, serverPlus);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }, [queryClient]);

  const [pollKey, setPollKey] = useState(0);
  const noteStoreStatus = useCallback((status: StoreStatus) => {
    setStore(status);
    setPollKey((n) => n + 1);
  }, []);

  useEffect(() => {
    if (pollKey === 0) return;
    const timers = AFTER_PURCHASE_POLLS.map((ms) => setTimeout(refresh, ms));
    return () => timers.forEach(clearTimeout);
  }, [pollKey, refresh]);

  // Sync after sign-in, when the app comes back, and shortly after practice.
  const learning = useLearning();
  const pending = learning.state.pending.length;
  const syncNow = useCallback(() => {
    if (signedIn && learning.loaded) void syncProgress(tier);
  }, [signedIn, learning.loaded, tier]);

  useEffect(() => {
    syncNow();
  }, [syncNow]);

  useEffect(() => {
    if (!signedIn || pending === 0) return;
    const timer = setTimeout(syncNow, 3_000);
    return () => clearTimeout(timer);
  }, [signedIn, pending, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        syncNow();
        refresh();
      }
    });
    return () => subscription.remove();
  }, [syncNow, refresh]);

  const value = useMemo<AccountValue>(
    () => ({
      signedIn,
      plus,
      tier,
      me,
      meLoading: signedIn && meQuery.isLoading,
      store: storeShown,
      cloudAvailable: cloud,
      quotaLeft: (capability) => quotaLeftFor(me, capability),
      refresh,
      noteStoreStatus,
      syncNow,
    }),
    [signedIn, plus, tier, me, meQuery.isLoading, storeShown, cloud, refresh, noteStoreStatus, syncNow],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside an AccountProvider.");
  return value;
}
