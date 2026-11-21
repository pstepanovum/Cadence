// FILE: src/lib/server/email/unsubscribe-store.ts
//
// Where an unsubscribe lands: users/{uid}.emailPrefs for reminders and the
// lifecycle tips; for the newsletter (news and offers), Brevo list 5 and, for
// an account holder, emailPrefs.newsletter = false, which also stops the
// lifecycle sale emails. Every category is on until a stored false. A uid with no account document is left alone rather than given
// one, so a token can never create anything.
import type { Firestore } from "firebase-admin/firestore";

import { auth as defaultAuth, db as defaultDb } from "../firebase";
import { readEmailPrefs } from "../../platform/email-consent";
import { BREVO_LISTS, contactLists, removeFromList } from "./brevo";
import type { UnsubscribeClaim, UnsubscribeStore } from "./unsubscribe-handler";

export function firestoreUnsubscribeStore(options: { db?: Firestore } = {}): UnsubscribeStore {
  const firestore = () => options.db ?? defaultDb();
  const uidForEmail = async (email: string): Promise<string | null> => {
    try {
      return (await defaultAuth().getUserByEmail(email)).uid;
    } catch {
      return null;
    }
  };
  const prefsOf = async (uid: string) => {
    const snapshot = await firestore().collection("users").doc(uid).get();
    return snapshot.exists ? ((snapshot.data()?.emailPrefs ?? {}) as Record<string, unknown>) : null;
  };

  return {
    async isUnsubscribed(claim: UnsubscribeClaim) {
      if (claim.list === "newsletter") {
        // An account's choice is its own preference (on unless false); a
        // subscriber without an account is whatever Brevo list 5 says.
        const uid = await uidForEmail(claim.subject);
        if (uid) {
          const prefs = await prefsOf(uid);
          return prefs ? !readEmailPrefs(prefs).newsletter : true;
        }
        const lists = await contactLists(claim.subject).catch(() => undefined);
        return lists === null || (Array.isArray(lists) && !lists.includes(BREVO_LISTS.newsletter));
      }
      const prefs = await prefsOf(claim.subject);
      return prefs ? !readEmailPrefs(prefs)[claim.list] : true;
    },

    async unsubscribe(claim: UnsubscribeClaim) {
      if (claim.list === "newsletter") {
        await removeFromList(claim.subject, BREVO_LISTS.newsletter);
        const uid = await uidForEmail(claim.subject);
        if (uid && (await firestore().collection("users").doc(uid).get()).exists) {
          await firestore().collection("users").doc(uid).set({ emailPrefs: { newsletter: false } }, { merge: true });
        }
        return;
      }
      const ref = firestore().collection("users").doc(claim.subject);
      if (!(await ref.get()).exists) return;
      await ref.set({ emailPrefs: { [claim.list]: false } }, { merge: true });
    },
  };
}
