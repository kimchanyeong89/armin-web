// Admin identity — single source of truth for "is the current user an admin?"
//
// Admin list = BOOTSTRAP_ADMINS (hardcoded, prevents lock-out) ∪ Firestore
// config/admins.emails (managed via the admin UI in AdminWeeklyPage).
//
// Firestore rules grant write access on config/admins to the bootstrap admins
// only — newly-added admins can use the dashboards but cannot grant admin to
// further accounts. This is intentional for V1.

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

/**
 * Hardcoded bootstrap admins. These cannot be removed via the UI — if all
 * Firestore-added admins disappear, the bootstrap admins still have access.
 */
export const BOOTSTRAP_ADMINS: readonly string[] = [
  'kietzland@gmail.com',
  'niet89@kookmin.ac.kr',
];

export interface AdminState {
  loading: boolean;
  signedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  isBootstrap: boolean;    // true if email is in BOOTSTRAP_ADMINS — these can manage other admins
  allAdmins: string[];     // bootstrap + Firestore admins, de-duped, sorted
}

const ADMINS_DOC_PATH = ['config', 'admins'] as const;

function uniqSorted(emails: string[]): string[] {
  return Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))).sort();
}

/**
 * Reactive admin state. Re-evaluates on auth changes AND on Firestore
 * config/admins changes.
 */
export function useIsAdmin(): AdminState {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [firestoreAdmins, setFirestoreAdmins] = useState<string[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [firestoreChecked, setFirestoreChecked] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setSignedIn(!!user);
      setEmail(user?.email ?? null);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const ref = doc(db, ...ADMINS_DOC_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as { emails?: string[] } | undefined;
        setFirestoreAdmins(Array.isArray(data?.emails) ? data!.emails! : []);
        setFirestoreChecked(true);
      },
      () => { setFirestoreChecked(true); },
    );
    return () => unsub();
  }, []);

  const allAdmins = uniqSorted([...BOOTSTRAP_ADMINS, ...firestoreAdmins]);
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const isAdmin = !!normalizedEmail && allAdmins.includes(normalizedEmail);
  const isBootstrap = !!normalizedEmail && BOOTSTRAP_ADMINS.includes(normalizedEmail);

  return {
    loading: !authChecked || !firestoreChecked,
    signedIn,
    email,
    isAdmin,
    isBootstrap,
    allAdmins,
  };
}

/** Add an email to the Firestore admin list. Caller must be a bootstrap admin. */
export async function addAdminEmail(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    throw new Error('Invalid email');
  }
  const ref = doc(db, ...ADMINS_DOC_PATH);
  const snap = await getDoc(ref);
  const current = (snap.data() as { emails?: string[] } | undefined)?.emails ?? [];
  if (current.map((x) => x.toLowerCase()).includes(e)) return;
  const next = uniqSorted([...current, e]);
  await setDoc(ref, { emails: next, updated_at: new Date().toISOString() }, { merge: true });
}

/** Remove a Firestore-added admin. Bootstrap admins cannot be removed this way. */
export async function removeAdminEmail(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (BOOTSTRAP_ADMINS.map((x) => x.toLowerCase()).includes(e)) {
    throw new Error('Cannot remove a bootstrap admin');
  }
  const ref = doc(db, ...ADMINS_DOC_PATH);
  const snap = await getDoc(ref);
  const current = (snap.data() as { emails?: string[] } | undefined)?.emails ?? [];
  const next = current.filter((x) => x.toLowerCase() !== e);
  await setDoc(ref, { emails: next, updated_at: new Date().toISOString() }, { merge: true });
}
