// useTasteScores — how today's exhibitions and the permanent collections match the
// signed-in user's liked artworks.
//
// The semantic-search worker keeps each user's taste clusters, rebuilds them whenever the
// like list changes, and scores against the data the exhibition sync uploads
// (scripts/taste/build-taste-data.mjs). This hook sends the current likes and shares one
// answer between every component that asks, so the list, its modal and the map cost one request.
// The answer is also kept in localStorage for a few hours, so reopening a page with the same
// likes asks nothing of the worker.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLikedArtworks } from '../../hooks/useLikedArtworks';
import { LIVE_EXHIBITIONS_EVENT, liveTasteVersion } from '../../data/liveExhibitions';

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
/** Hearts often come in bursts; wait for a pause before asking again. */
const SETTLE_MS = 1200;
/** A taste moves only when the likes do (a new like changes the key and asks again), so the
 *  answer is kept for a day. A morning that brings new shows asks again sooner: the uploaded
 *  exhibition lists name the score data built for them (liveTasteVersion), and an answer older
 *  than that is not used. */
const KEPT_FOR_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'colly:taste-scores:';

export interface TasteScores {
  /** Exhibition id → 1–99. 50 is a typical exhibition for this user. */
  exhibitions: Record<string, number>;
  /** Museums holding the most of the user's taste, best first; `lift` is how many times their share. */
  museums: { id: string; lift: number }[];
  likedCount: number;
  /** Which uploaded data the answer was scored against (versions are sortable timestamps). */
  dataVersions?: { exhibitions?: string | null; museums?: string | null };
}

/** The answer for the latest like list, shared by every caller. A failed answer is dropped so the next mount retries. */
const answers = new Map<string, Promise<TasteScores | null>>();

/** A short fingerprint of a like list, so the kept answer does not store every id. */
function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
}

function readKept(userId: string, likes: string): TasteScores | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return null;
    const kept = JSON.parse(raw) as { likes: string; savedAt: number; scores: TasteScores };
    if (kept.likes !== likes || Date.now() - kept.savedAt >= KEPT_FOR_MS) return null;
    // Scored before today's exhibition lists were built: new shows would have no score, so ask again.
    const live = liveTasteVersion();
    const scoredOn = kept.scores.dataVersions?.exhibitions;
    if (live && (!scoredOn || scoredOn < live)) return null;
    return kept.scores;
  } catch {
    return null;
  }
}

function keep(userId: string, likes: string, scores: TasteScores) {
  // An answer without data (before the first upload) is not kept, or it would hide the scores for hours.
  if (!Object.keys(scores.exhibitions).length && !scores.museums.length) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify({ likes, savedAt: Date.now(), scores }));
  } catch {
    // Private browsing or a full quota: the answer is simply not kept.
  }
}

function fetchTasteScores(key: string, userId: string, likedIds: string[]): Promise<TasteScores | null> {
  const known = answers.get(key);
  if (known) return known;
  const likes = fingerprint(key);
  const kept = readKept(userId, likes);
  const answer = kept
    ? Promise.resolve(kept)
    : fetch(`${WORKER_URL}/taste-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, likedIds }),
      })
        .then((res) => (res.ok ? (res.json() as Promise<TasteScores>) : null))
        .catch(() => null)
        .then((scores) => {
          if (scores) keep(userId, likes, scores);
          else answers.delete(key);
          return scores;
        });
  answers.clear();
  answers.set(key, answer);
  return answer;
}

/** Weekly curation saves an artwork as `collection#id`; the vector index knows it by the id alone. */
const vectorIdOf = (likedId: string) => likedId.slice(likedId.indexOf('#') + 1);

/** The scores; `undefined` while a taste is on its way, `null` when there is none (signed out, no likes, failed). */
export function useTasteScores(): TasteScores | null | undefined {
  const { user, loading: authLoading } = useAuth();
  const { loading, ids } = useLikedArtworks();
  const userId = user?.uid ?? null;
  const likedIds = useMemo(() => Array.from(new Set(Array.from(ids, vectorIdOf))).sort(), [ids]);
  const key = userId && !loading && likedIds.length ? `${userId}\n${likedIds.join('\n')}` : '';
  const [answer, setAnswer] = useState<{ key: string; scores: TasteScores | null } | null>(null);
  // Newer exhibition lists arriving after the page started may come with newer scores.
  const [listsSeen, setListsSeen] = useState(0);
  useEffect(() => {
    const onLists = () => {
      answers.clear();
      setListsSeen((n) => n + 1);
    };
    window.addEventListener(LIVE_EXHIBITIONS_EVENT, onLists);
    return () => window.removeEventListener(LIVE_EXHIBITIONS_EVENT, onLists);
  }, []);

  useEffect(() => {
    if (!key || !userId) return;
    let alive = true;
    const ready = answers.has(key) || readKept(userId, fingerprint(key)) !== null;
    const timer = setTimeout(() => {
      fetchTasteScores(key, userId, likedIds).then((scores) => {
        if (alive) setAnswer({ key, scores });
      });
    }, ready ? 0 : SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // likedIds is part of key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, listsSeen]);

  if (authLoading) return undefined;
  if (!userId || (!loading && !likedIds.length)) return null;
  // While a changed like list settles, the last answer for this user stays on screen.
  if (answer?.key.startsWith(`${userId}\n`)) return answer.scores;
  // An answer kept on this device for these likes is used from the first paint, so the list never reorders.
  return (key && readKept(userId, fingerprint(key))) || undefined;
}
