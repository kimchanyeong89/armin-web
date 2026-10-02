// liveExhibitions — keeps every museum's exhibition lists current without an app deploy.
//
// Two jobs, both done on the museum objects of ./exhibitions.js in place, so every screen
// that reads that module (the map's venue panel, nearby exhibitions, /exhibitions, …) sees
// the same lists without changes of its own:
//
//   1. The morning sync on the Mac uploads the lists to the semantic-search worker
//      (scripts/exhibitions/daily.sh → publish-live.mjs). They replace the bundled ones:
//      the last copy kept in localStorage at once, the worker's copy when it arrives.
//   2. Each show is placed by its own dates. One whose end date has passed moves to its
//      museum's past list, and upcoming turns ongoing on its start date — even on a
//      morning the sync did not run, and for museums the sync does not cover.
//
// main.tsx imports this before App, so the kept copy and the dates are settled before
// anything renders.
import { exhibitions } from './exhibitions.js';

const LIVE_URL = 'https://armin-semantic-search.armin-art.workers.dev/exhibitions-data';
const KEPT_KEY = 'colly:live-exhibitions';

type Phase = 'upcoming' | 'ongoing' | 'past';
interface Show { id?: string; startDate?: string; endDate?: string; status?: string }
interface Lists { temporaryExhibitions: Show[]; pastExhibitions: Show[] }
interface Museum { id: string; temporaryExhibitions?: Show[]; pastExhibitions?: Show[] }
/** tasteVersion: the taste-score data built for these lists (see useTasteScores). */
interface LiveData { version: string; tasteVersion?: string; museums: Record<string, Lists> }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today in Korea as YYYY-MM-DD; the dates in the data are calendar days, compared as text. */
function koreaToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** Where a show stands today, read off its dates. Without a usable date it keeps its status. */
export function exhibitionPhase(show: Show, today = koreaToday()): Phase {
  const end = String(show.endDate ?? '');
  if (ISO_DAY.test(end)) {
    if (end < today) return 'past';
  } else if (show.status === 'past') {
    return 'past';
  }
  const start = String(show.startDate ?? '');
  if (ISO_DAY.test(start)) return start > today ? 'upcoming' : 'ongoing';
  return show.status === 'upcoming' ? 'upcoming' : 'ongoing';
}

/** Moves ended shows into their museum's past list (latest first) and brings every status up to date. */
function settleByDate(today = koreaToday()) {
  for (const museum of exhibitions as Museum[]) {
    const current = museum.temporaryExhibitions;
    if (!current?.length) continue;
    const ended: Show[] = [];
    const kept: Show[] = [];
    for (const show of current) {
      const phase = exhibitionPhase(show, today);
      show.status = phase;
      (phase === 'past' ? ended : kept).push(show);
    }
    if (!ended.length) continue;
    current.splice(0, current.length, ...kept);
    const past = museum.pastExhibitions ?? (museum.pastExhibitions = []);
    const known = new Set(past.map((s) => s.id).filter(Boolean));
    ended.sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
    past.unshift(...ended.filter((s) => !s.id || !known.has(s.id)));
  }
}

function isLiveData(value: unknown): value is LiveData {
  const data = value as LiveData;
  return !!data && typeof data.version === 'string' && !!data.museums && typeof data.museums === 'object';
}

/** Swaps the uploaded lists into the bundled museums. Arrays are refilled, not replaced, so earlier readers see the change. */
function applyLive(data: LiveData) {
  for (const museum of exhibitions as Museum[]) {
    const lists = data.museums[museum.id];
    if (!Array.isArray(lists?.temporaryExhibitions) || !Array.isArray(lists?.pastExhibitions)) continue;
    for (const key of ['temporaryExhibitions', 'pastExhibitions'] as const) {
      const target = museum[key];
      if (target) target.splice(0, target.length, ...lists[key]);
      else museum[key] = [...lists[key]];
    }
  }
  settleByDate();
}

function readKept(): LiveData | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEPT_KEY) || 'null');
    return isLiveData(kept) ? kept : null;
  } catch {
    return null;
  }
}

let appliedVersion: string | null = null;
let tasteVersion: string | null = null;

/** Fired when a newer set of lists has been swapped in after the page started. */
export const LIVE_EXHIBITIONS_EVENT = 'colly:live-exhibitions';

/**
 * The version of the taste-score data built for the lists on screen, or null before any
 * uploaded lists are known. The morning job builds the scores first and then uploads the
 * lists carrying this version, so a kept score answer of another version predates today's shows.
 */
export function liveTasteVersion(): string | null {
  return tasteVersion;
}

const kept = typeof window !== 'undefined' ? readKept() : null;
if (kept) {
  applyLive(kept);
  appliedVersion = kept.version;
  tasteVersion = kept.tasteVersion ?? null;
} else {
  settleByDate();
}

if (typeof window !== 'undefined') {
  fetch(LIVE_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => {
      if (!isLiveData(data) || data.version === appliedVersion) return;
      applyLive(data);
      appliedVersion = data.version;
      tasteVersion = data.tasteVersion ?? null;
      window.dispatchEvent(new Event(LIVE_EXHIBITIONS_EVENT));
      try {
        localStorage.setItem(KEPT_KEY, JSON.stringify(data));
      } catch {
        // Private browsing or a full quota: the next visit simply asks again.
      }
    })
    .catch(() => {
      // Offline or the worker is down: the bundled lists, already settled by date, stay.
    });
}
