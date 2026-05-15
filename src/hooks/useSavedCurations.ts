// useSavedCurations — manages the user's saved curations subcollection.
//
// Firestore layout: users/{uid}/saved_curations/{curation_id}
// `curation_id` matches the published file's `id` field.
//
// We treat the file as "weekly" when it has only `week` (no `slug`), and
// "special" when it has `slug` + `source_week` (we read the latter from the
// raw file because the WeeklyPublishedFile type doesn't carry those fields
// in V1; special files extend the shape at runtime).

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { WeeklyPublishedFile } from '../types/weekly';

export type SavedCurationType = 'weekly' | 'special';

export interface SavedCuration {
  curation_id: string;
  type: SavedCurationType;
  week: string | null;
  slug: string | null;
  title_en: string;
  title_ko: string;
  persona_id: string;
  lens: string;
  hero_image_url: string;
  works_count: number;
  subtitle_chip: string;
  saved_at: Date | null;
  source_url: string;
}

interface SavedCurationsState {
  loading: boolean;
  signedIn: boolean;
  items: SavedCuration[];
}

interface SavedFlagState {
  loading: boolean;
  saved: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Special-series files extend WeeklyPublishedFile with `slug` + `source_week`. */
type MaybeSpecialFile = WeeklyPublishedFile & {
  slug?: string;
  source_week?: string;
};

function pickHeroImage(file: WeeklyPublishedFile): string {
  const hero = file.works.find((w) => w.role === 'hero') ?? file.works[0];
  return hero?.image_url ?? '';
}

function buildPayload(file: WeeklyPublishedFile): Omit<SavedCuration, 'saved_at'> & { saved_at: ReturnType<typeof serverTimestamp> } {
  const f = file as MaybeSpecialFile;
  const isSpecial = typeof f.slug === 'string' && f.slug.length > 0;
  const sourceWeek = typeof f.source_week === 'string' ? f.source_week : null;

  return {
    curation_id: file.id,
    type: isSpecial ? 'special' : 'weekly',
    week: isSpecial ? sourceWeek : file.week,
    slug: isSpecial ? f.slug! : null,
    title_en: file.title_en,
    title_ko: file.title_ko,
    persona_id: file.persona_id,
    lens: file.lens,
    hero_image_url: pickHeroImage(file),
    works_count: file.works.length,
    subtitle_chip: file.subtitle_chip,
    saved_at: serverTimestamp(),
    source_url: isSpecial
      ? `/data/special-series/${f.slug}.json`
      : `/data/weekly-curations/${file.week}.json`,
  };
}

function toSavedCuration(id: string, data: any): SavedCuration {
  const ts = data?.saved_at;
  let saved_at: Date | null = null;
  if (ts instanceof Timestamp) saved_at = ts.toDate();
  else if (ts && typeof ts.toDate === 'function') {
    try { saved_at = ts.toDate(); } catch { saved_at = null; }
  }
  return {
    curation_id: data?.curation_id ?? id,
    type: data?.type === 'special' ? 'special' : 'weekly',
    week: typeof data?.week === 'string' ? data.week : null,
    slug: typeof data?.slug === 'string' ? data.slug : null,
    title_en: String(data?.title_en ?? ''),
    title_ko: String(data?.title_ko ?? ''),
    persona_id: String(data?.persona_id ?? ''),
    lens: String(data?.lens ?? ''),
    hero_image_url: String(data?.hero_image_url ?? ''),
    works_count: Number(data?.works_count ?? 0),
    subtitle_chip: String(data?.subtitle_chip ?? ''),
    saved_at,
    source_url: String(data?.source_url ?? ''),
  };
}

// ── Write helpers ──────────────────────────────────────────────────────────

/** Save a curation. Throws if user is not signed in. */
export async function saveCuration(file: WeeklyPublishedFile): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  const ref = doc(db, 'users', user.uid, 'saved_curations', file.id);
  await setDoc(ref, buildPayload(file));
}

/** Unsave a curation by its id. No-op if not signed in. */
export async function unsaveCuration(curationId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, 'users', user.uid, 'saved_curations', curationId);
  await deleteDoc(ref);
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/** Subscribe to the signed-in user's saved curations (newest first). */
export function useSavedCurations(): SavedCurationsState {
  const [state, setState] = useState<SavedCurationsState>({
    loading: true,
    signedIn: false,
    items: [],
  });

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setState({ loading: false, signedIn: false, items: [] });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, signedIn: true }));
      const q = query(
        collection(db, 'users', user.uid, 'saved_curations'),
        orderBy('saved_at', 'desc'),
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => toSavedCuration(d.id, d.data()));
          setState({ loading: false, signedIn: true, items });
        },
        () => {
          setState({ loading: false, signedIn: true, items: [] });
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

/** Subscribe to a single saved_curations doc to drive button state. */
export function useIsCurationSaved(curationId: string | null | undefined): SavedFlagState {
  const [state, setState] = useState<SavedFlagState>({ loading: true, saved: false });

  useEffect(() => {
    if (!curationId) {
      setState({ loading: false, saved: false });
      return;
    }

    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setState({ loading: false, saved: false });
        return;
      }

      const ref = doc(db, 'users', user.uid, 'saved_curations', curationId);
      unsubFirestore = onSnapshot(
        ref,
        (snap) => setState({ loading: false, saved: snap.exists() }),
        () => setState({ loading: false, saved: false }),
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, [curationId]);

  return state;
}
