// Shows "Plus is on" once when Plus turns on from a grant. Which grants are
// new is lib/plus-gift.ts; what was seen lives in AsyncStorage per account,
// and a grant counts as seen once the sheet is on screen. /api/me is asked
// again whenever the app comes back, so a grant shows on return as well as on
// the next launch. It waits for calm: a tab screen (never a lesson, a game, a
// session or the Plus screen), the app in front, nothing else celebrating.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { PlusGiftSheet, type PlusGiftContent } from "@/components/PlusGiftSheet";
import { useAccount } from "@/context/account";
import { useAuth } from "@/context/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { haptics } from "@/lib/haptics";
import { CALM_FOR_MS, decidePlusGift, grantFromMe, isCalmPath, plusGiftCopy, subscribedFromMe } from "@/lib/plus-gift";

/** The grant last shown (or found) on this device, per account. */
const SEEN_KEY = "cadence.plusGift.v1";
const POLL_MS = 400;

type Waiting = { uid: string; content: PlusGiftContent; shown: () => Promise<void> };

const untilDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export function PlusGiftWatcher({ held }: { held: boolean }) {
  const account = useAccount();
  const { user } = useAuth();
  const uid = account.signedIn ? (user?.uid ?? null) : null;
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [content, setContent] = useState<PlusGiftContent | null>(null);
  const queued = useRef(new Set<string>());

  // Decide once /api/me has loaded, and whenever it changes.
  const me = account.me;
  const storeActive = account.store.active;
  useEffect(() => {
    if (!uid || !me) return;
    const now = Date.now();
    const grant = grantFromMe(me, now);
    if (grant === undefined) return;
    let active = true;
    void (async () => {
      const key = `${SEEN_KEY}.${uid}`;
      const seen = await AsyncStorage.getItem(key).catch(() => null);
      const currentUser = getFirebaseAuth()?.currentUser ?? null;
      const created = Date.parse(currentUser?.metadata.creationTime ?? "");
      const { remember, show } = decidePlusGift({
        grant,
        subscribed: subscribedFromMe(me, storeActive, now),
        seen,
        accountCreatedAt: Number.isFinite(created) ? created : null,
        now,
      });
      if (!active) return;
      if (!show || !grant) {
        // The first check is stored even when it finds nothing, so a grant after it shows.
        if (remember !== seen) await AsyncStorage.setItem(key, remember).catch(() => undefined);
        return;
      }
      if (queued.current.has(`${uid}:${remember}`) || currentUser?.uid !== uid) return;
      queued.current.add(`${uid}:${remember}`);
      setWaiting({
        uid,
        content: plusGiftCopy(grant, untilDate),
        shown: () => AsyncStorage.setItem(key, remember).catch(() => undefined),
      });
    })();
    return () => {
      active = false;
    };
  }, [uid, me, storeActive]);

  // Read by the timer below, so it sees the latest screen without restarting.
  const route = useRef(pathname);
  const busy = useRef(held);
  useEffect(() => {
    route.current = pathname;
    busy.current = held;
  }, [pathname, held]);

  // Only this account's sheet: after a sign-out another's is left waiting, never shown.
  const next = content || !waiting || waiting.uid !== uid ? null : waiting;
  useEffect(() => {
    if (!next) return;
    let calmSince: number | null = null;
    const timer = setInterval(() => {
      const calm = isCalmPath(route.current) && AppState.currentState === "active" && !busy.current;
      if (!calm) {
        calmSince = null;
        return;
      }
      calmSince ??= Date.now();
      if (Date.now() - calmSince < CALM_FOR_MS) return;
      clearInterval(timer);
      setWaiting(null);
      setContent(next.content);
      void next.shown();
      haptics.success();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [next]);

  return <PlusGiftSheet content={content} onClose={() => setContent(null)} />;
}
