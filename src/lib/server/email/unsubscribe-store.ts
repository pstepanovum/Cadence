// FILE: src/lib/server/email/unsubscribe-store.ts
//
// Where an unsubscribe lands: users/{uid}.emailPrefs for reminders and the
// lifecycle tips, Brevo list 5 (and a matching account's preference) for the
// newsletter. A uid with no account document is left alone rather than given
// one, so a token can never create anything.
import type { Firestore } from "firebase-admin/firestore";

import { auth as defaultAuth, db as defaultDb } from "../firebase";
import { BREVO_LISTS, contactLists, removeFromList } from "./brevo";
import type { UnsubscribeClaim, UnsubscribeStore } from "./unsubscribe-handler";

export function firestoreUnsubscribeStore(options: { db?: Firestore } = {}): UnsubscribeStore {
  const firestore = () => options.db ?? defaultDb();
  const prefsOf = async (uid: string) => {
    const snapshot = await firestore().collection("users").doc(uid).get();
    return snapshot.exists ? ((snapshot.data()?.emailPrefs ?? {}) as Record<string, unknown>) : null;
  };

  return {
    async isUnsubscribed(claim: UnsubscribeClaim) {
      if (claim.list === "newsletter") {
        const lists = await contactLists(claim.subject).catch(() => undefined);
        return lists === null || (Array.isArray(lists) && !lists.includes(BREVO_LISTS.newsletter));
      }
      const prefs = await prefsOf(claim.subject);
      if (!prefs) return true;
      // Reminders are opt-in (only true counts); the tips are on unless turned off.
      return claim.list === "reminders" ? prefs.reminders !== true : prefs.lifecycle === false;
    },

    async unsubscribe(claim: UnsubscribeClaim) {
      if (claim.list === "newsletter") {
        await removeFromList(claim.subject, BREVO_LISTS.newsletter);
        try {
          const user = await defaultAuth().getUserByEmail(claim.subject);
          await firestore().collection("users").doc(user.uid).set({ emailPrefs: { newsletter: false } }, { merge: true });
        } catch {
          // A subscriber without an account.
        }
        return;
      }
      const ref = firestore().collection("users").doc(claim.subject);
      if (!(await ref.get()).exists) return;
      await ref.set({ emailPrefs: { [claim.list]: false } }, { merge: true });
    },
  };
}
