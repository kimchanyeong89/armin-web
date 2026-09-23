import { useEffect, useState, useSyncExternalStore } from "react";
import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import {
  reviewRef,
  reviewsCollection,
  statsCollection,
  subjectKey,
  type RatingStats,
  type RatingSubject,
  type Review,
} from "./ratingWrites";

/*
 * Every average on screen comes from one listener on rating_stats, shared by
 * all mounted ratings, so a grid of fifty posters is still one connection.
 * It starts with the first subscriber and stops when the last one leaves.
 */
let statsByKey: ReadonlyMap<string, RatingStats> = new Map();
const subscribers = new Set<() => void>();
let stopStats: (() => void) | null = null;

function subscribeStats(onChange: () => void) {
  subscribers.add(onChange);
  if (!stopStats) {
    stopStats = onSnapshot(
      statsCollection(db),
      (snap) => {
        const next = new Map<string, RatingStats>();
        snap.forEach((d) => next.set(d.id, d.data() as RatingStats));
        statsByKey = next;
        subscribers.forEach((notify) => notify());
      },
      () => {
        /* unreadable (offline, or rules not deployed): ratings show no average */
      },
    );
  }
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0 && stopStats) {
      stopStats();
      stopStats = null;
    }
  };
}

const readStats = () => statsByKey;

/** Live totals for everything rated, keyed by subjectKey(). */
export function useAllRatingStats(): ReadonlyMap<string, RatingStats> {
  return useSyncExternalStore(subscribeStats, readStats, readStats);
}

/** Live totals for one subject, or null until someone rates it. */
export function useRatingStats(subject: RatingSubject): RatingStats | null {
  return useAllRatingStats().get(subjectKey(subject)) ?? null;
}

/** Newest reviews first; null while the first snapshot is on its way. */
export function useReviews(subject: RatingSubject, max = 50): Review[] | null {
  const key = subjectKey(subject);
  const [state, setState] = useState<{ key: string; reviews: Review[] } | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(reviewsCollection(db, subject), orderBy("updatedAt", "desc"), limit(max)),
      (snap) =>
        setState({ key, reviews: snap.docs.map((d) => d.data({ serverTimestamps: "estimate" }) as Review) }),
      () => setState({ key, reviews: [] }),
    );
    // the key names the subject; the object itself is rebuilt on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, max]);

  return state?.key === key ? state.reviews : null;
}

/** The signed-in user's own review of this subject, if they left one. */
export function useMyReview(subject: RatingSubject, uid: string | null | undefined): Review | null {
  const key = uid ? `${subjectKey(subject)}|${uid}` : "";
  const [state, setState] = useState<{ key: string; review: Review | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      reviewRef(db, subject, uid),
      (snap) =>
        setState({ key, review: snap.exists() ? (snap.data({ serverTimestamps: "estimate" }) as Review) : null }),
      () => setState({ key, review: null }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state && state.key === key ? state.review : null;
}
