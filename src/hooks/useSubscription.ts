// useSubscription — reads users/{uid}/private/subscription and exposes a
// simple "is the current user an active subscriber?" boolean for V1.
//
// Doc shape (written by PaymentSuccessPage after a successful Toss charge):
//   { expires_at: Timestamp, plan: 'monthly' | ... }
//
// V1 only checks `expires_at > now`. `plan` is stored for future tiers but
// ignored here. Missing doc / missing field / past Timestamp → not a sub.

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface SubscriptionState {
  loading: boolean;
  signedIn: boolean;
  isSubscriber: boolean;
  expiresAt: Date | null;
}

const DEFAULT_STATE: SubscriptionState = {
  loading: true,
  signedIn: false,
  isSubscriber: false,
  expiresAt: null,
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
      // Tear down any previous firestore listener when auth changes.
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      if (!user) {
        setState({ loading: false, signedIn: false, isSubscriber: false, expiresAt: null });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, signedIn: true }));

      const ref = doc(db, 'users', user.uid, 'private', 'subscription');
      unsubFirestore = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setState({ loading: false, signedIn: true, isSubscriber: false, expiresAt: null });
            return;
          }
          const data = snap.data();
          const raw = data?.expires_at;
          let expiresAt: Date | null = null;
          if (raw instanceof Timestamp) {
            expiresAt = raw.toDate();
          } else if (raw && typeof raw.toDate === 'function') {
            // Defensive: some SDK code paths produce non-instanceof Timestamps.
            try { expiresAt = raw.toDate(); } catch { expiresAt = null; }
          }
          const isSubscriber = expiresAt ? expiresAt.getTime() > Date.now() : false;
          setState({ loading: false, signedIn: true, isSubscriber, expiresAt });
        },
        () => {
          // Permission denied / offline → treat as not subscribed but
          // surface that we're done loading.
          setState({ loading: false, signedIn: true, isSubscriber: false, expiresAt: null });
        },
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  return state;
}
