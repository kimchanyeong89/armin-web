// useLikedArtworks — manages the user's liked artworks subcollection.
//
// Firestore layout: users/{uid}/liked_artworks/{sanitized_artwork_ref}
// `artwork_ref` is the canonical id used in WeeklyWork (`${collection}#${id}`).
// We only sanitize `/` → `__` to keep parity with the rest of the codebase
// (see src/adapters/firebaseWebAdapter.ts). `#` is a valid Firestore doc-id
// character.
//
// This hook mirrors useSavedCurations but for per-artwork saves coming from
// the Weekly Curation screen. Other places in the app that touch
// liked_artworks (ExhibitionModal, HomePage, …) use ad-hoc setDoc/deleteDoc
// calls — we deliberately don't refactor those here, the request was
// scoped to the weekly curation save buttons.

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

export type LikeSource = 'weekly_curation' | 'special_curation';

/**
 * Minimal shape a caller must provide to save an artwork. Fields mirror the
 * canonical WeeklyWork type but the field names match the published-file
 * shape (artwork_ref, image_url, source_collection) so this hook is the
 * single source of truth for what gets persisted.
 */
export interface ArtworkLikePayload {
  artwork_ref: string;
  artist: string;
  title: string;
  year: string;
  image_url: string;
  source_collection: string;
}

interface LikedFlagState {
  loading: boolean;
  liked: boolean;
}

// `/` is the only character Firestore actually forbids in doc ids; keep the
// same sanitizer used elsewhere in the codebase so a given artwork_ref maps
// to the same doc regardless of which UI wrote it.
function sanitizeDocId(value: string): string {
  return String(value).replace(/\//g, '__');
}

function buildPayload(work: ArtworkLikePayload, source: LikeSource) {
  // Write the field names MyPage (`Mypage.tsx`) already reads when listing
  // liked_artworks — artworkId / title / artist / image / museumName /
  // sourceCollection. If we wrote only the curation-internal snake_case
  // shape, the user would press "save" → see "Saved" → open MyPage Artworks
  // tab → find nothing. Cross-surface compatibility wins over local purity.
  // We also keep the snake_case fields so internal hook readers (e.g. the
  // useLikedArtworks list view) work uniformly.
  return {
    artworkId: work.artwork_ref,
    title: work.title,
    artist: work.artist,
    year: work.year,
    image: work.image_url,
    imageUrl: work.image_url,
    museumName: work.source_collection,
    sourceCollection: work.source_collection,
    exhibitionId: work.source_collection,
    // Snake-case aliases for the curation pipeline:
    artwork_ref: work.artwork_ref,
    image_url: work.image_url,
    source_collection: work.source_collection,
    saved_at: serverTimestamp(),
    source,
  };
}

// ── Write helpers ──────────────────────────────────────────────────────────

/** Save an artwork. Throws if user is not signed in. */
export async function likeArtwork(work: ArtworkLikePayload, source: LikeSource): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  const ref = doc(db, 'users', user.uid, 'liked_artworks', sanitizeDocId(work.artwork_ref));
  await setDoc(ref, buildPayload(work, source), { merge: true });
}

/** Unsave an artwork by its artwork_ref. No-op if not signed in. */
export async function unlikeArtwork(artworkRef: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, 'users', user.uid, 'liked_artworks', sanitizeDocId(artworkRef));
  await deleteDoc(ref);
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Subscribe to the set of liked artwork_refs for the signed-in user. Returns
 * a Set so callers can do O(1) membership checks. Empty + loading=false when
 * signed out.
 */
export function useLikedArtworks(): { loading: boolean; ids: Set<string> } {
  const [state, setState] = useState<{ loading: boolean; ids: Set<string> }>({
    loading: true,
    ids: new Set(),
  });

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setState({ loading: false, ids: new Set() });
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));
      const col = collection(db, 'users', user.uid, 'liked_artworks');
      unsubFirestore = onSnapshot(
        col,
        (snap) => {
          const ids = new Set<string>();
          snap.forEach((d) => {
            const data = d.data() as { artwork_ref?: string };
            // Prefer the artwork_ref field (un-sanitized) so callers can
            // compare against WeeklyWork.artwork_ref directly. Fall back to
            // the doc id for older docs that didn't write the field.
            ids.add(typeof data?.artwork_ref === 'string' ? data.artwork_ref : d.id);
          });
          setState({ loading: false, ids });
        },
        () => setState({ loading: false, ids: new Set() }),
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  return state;
}

/** Single-artwork flag — useful when only one row needs the state. */
export function useIsArtworkLiked(artworkRef: string | null | undefined): LikedFlagState {
  const [state, setState] = useState<LikedFlagState>({ loading: true, liked: false });

  useEffect(() => {
    if (!artworkRef) {
      setState({ loading: false, liked: false });
      return;
    }

    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user: User | null) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setState({ loading: false, liked: false });
        return;
      }

      const ref = doc(db, 'users', user.uid, 'liked_artworks', sanitizeDocId(artworkRef));
      unsubFirestore = onSnapshot(
        ref,
        (snap) => setState({ loading: false, liked: snap.exists() }),
        () => setState({ loading: false, liked: false }),
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, [artworkRef]);

  return state;
}
