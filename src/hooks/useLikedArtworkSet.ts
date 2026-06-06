// useLikedArtworkSet — shared liked-artworks state for the search / curation
// surfaces (GlobalSearchBar, AICurationHubPage).
//
// These surfaces only need fast "is this artwork liked?" membership checks plus
// an optimistic toggle, keyed on the raw artwork id and its Firestore-safe
// variant. The weekly-curation screen uses the separate useLikedArtworks() hook
// (keyed on artwork_ref) — the two intentionally stay distinct.
//
// Firestore: users/{uid}/liked_artworks/{sanitized_id}
//
// The pure helpers below (normalizeArtworkIdForFirestore, buildLikedIdSet,
// toggleIdInSet, isIdInSet) are exported so the membership / toggle logic can
// be unit-tested without React or Firebase — see useLikedArtworkSet.test.ts.

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { createFirebaseWebPort } from '../adapters/firebaseWebAdapter';
import { shouldLimitNetwork } from '../utils/network';

const firebaseWebPort = createFirebaseWebPort();

// ── Pure helpers (exported for unit testing) ────────────────────────────────

/**
 * `/` is the only character Firestore forbids in a document id. This mirrors
 * the sanitizer used across the codebase so a given artwork maps to the same
 * doc regardless of which surface wrote it.
 */
export const normalizeArtworkIdForFirestore = (value?: unknown): string =>
  String(value ?? '').trim().replace(/\//g, '__');

/**
 * Build the membership Set from liked_artworks docs. Each doc contributes its
 * doc id, its artworkId/semanticId field, and the normalized variant — so an
 * isLiked() check matches whatever id shape the caller happens to hold.
 */
export function buildLikedIdSet(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): Set<string> {
  const ids = new Set<string>();
  docs.forEach((d) => {
    const docId = String(d.id || '').trim();
    const data = d.data() || {};
    const artworkId = String(data.artworkId ?? data.semanticId ?? '').trim();
    if (docId) ids.add(docId);
    if (artworkId) {
      ids.add(artworkId);
      ids.add(normalizeArtworkIdForFirestore(artworkId));
    }
  });
  return ids;
}

/**
 * Return a NEW Set with the artwork's raw + Firestore-safe ids added (liked) or
 * removed (!liked). The input set is never mutated, so this is safe to use
 * directly as a React state updater.
 */
export function toggleIdInSet(set: Set<string>, rawId: string, liked: boolean): Set<string> {
  const safeId = normalizeArtworkIdForFirestore(rawId);
  const next = new Set(set);
  if (liked) {
    next.add(rawId);
    next.add(safeId);
  } else {
    next.delete(rawId);
    next.delete(safeId);
  }
  return next;
}

/** True when the id (raw or Firestore-safe variant) is in the set. */
export function isIdInSet(set: Set<string>, id?: string | null): boolean {
  const raw = String(id || '').trim();
  if (!raw) return false;
  return set.has(raw) || set.has(normalizeArtworkIdForFirestore(raw));
}

/** Superset like-payload covering every field the various callers persist. */
function buildLikePayload(art: any, artworkId: string): Record<string, unknown> {
  return {
    artworkId,
    id: artworkId,
    title: art?.title || art?.name || art?.n || 'Untitled',
    name: art?.name || art?.title || art?.n || 'Untitled',
    artist: art?.artist || art?.a || 'Unknown',
    image: art?.image || art?.i || '',
    i: art?.image || art?.i || '',
    museumName: art?.museumName || art?.museum || art?.m || '',
    year: String(art?.year || art?.date || art?.period || art?.d || ''),
    exhibitionId: art?.exhibitionId || art?.e || '',
    country: art?.country || '',
    sourceCollection: art?.sourceCollection || '',
    officialUrl: art?.officialUrl || art?.detailUrl || '',
    likedAt: Date.now(),
  };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export interface LikedArtworkSet {
  /** Liked artwork ids (raw + Firestore-safe variants) for O(1) membership. */
  likedIds: Set<string>;
  /** True when the given artwork id (any variant) is liked. */
  isLiked: (id?: string | null) => boolean;
  /**
   * Optimistically toggle the like, then persist to Firestore. Rolls the UI
   * back on write failure. Returns the resulting id list on success, or null
   * when the toggle was a no-op (no user / no id) or the write failed.
   */
  toggleLike: (artwork: any) => Promise<string[] | null>;
}

export function useLikedArtworkSet(): LikedArtworkSet {
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubFirestore) { unsubFirestore(); unsubFirestore = null; }

      if (!user) {
        setLikedIds(new Set());
        return;
      }

      const col = collection(db, `users/${user.uid}/liked_artworks`);

      // Constrained networks: one-shot read instead of a live listener.
      if (shouldLimitNetwork()) {
        getDocs(col)
          .then((snap) => setLikedIds(buildLikedIdSet(snap.docs)))
          .catch(() => setLikedIds(new Set()));
        return;
      }

      unsubFirestore = onSnapshot(
        col,
        (snap) => setLikedIds(buildLikedIdSet(snap.docs)),
        (error) => console.error('liked_artworks listener failed:', error),
      );
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  const isLiked = useCallback(
    (id?: string | null): boolean => isIdInSet(likedIds, id),
    [likedIds],
  );

  const toggleLike = useCallback(
    async (artwork: any): Promise<string[] | null> => {
      const user = auth.currentUser;
      if (!user) return null;

      const rawId = String(artwork?.id ?? artwork?.artworkId ?? '').trim();
      if (!rawId) return null;
      const wasLiked = isIdInSet(likedIds, rawId);

      // Optimistic flip — the heart responds to the click immediately.
      setLikedIds((prev) => toggleIdInSet(prev, rawId, !wasLiked));

      try {
        if (wasLiked) {
          await firebaseWebPort.likes.removeLikedArtwork(user.uid, rawId);
        } else {
          await firebaseWebPort.likes.setLikedArtwork(user.uid, rawId, buildLikePayload(artwork, rawId));
        }
      } catch (error) {
        // Write failed — roll the heart back to what is actually persisted.
        console.error('Failed to toggle artwork like:', error);
        setLikedIds((prev) => toggleIdInSet(prev, rawId, wasLiked));
        return null;
      }

      // Resulting id list (raw + safe variants) for callers that need it,
      // e.g. taste-profile updates.
      return Array.from(toggleIdInSet(likedIds, rawId, !wasLiked));
    },
    [likedIds],
  );

  return { likedIds, isLiked, toggleLike };
}
