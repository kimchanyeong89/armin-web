// Where the weekly curation lives, in one place.
//
// - Proposals (the candidate pool) come from the semantic-search worker, where the
//   Sunday-morning job puts them (scripts/weekly/upload-proposals.mjs). The old
//   pools shipped as files under /data/weekly-proposals/ are still read.
// - A published curation is a Firestore document, weekly_curations/{week}, written
//   from /admin/weekly by an admin; it is live at once, with no deploy. The weeks
//   published before this (files under /data/weekly-curations/) are still read.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { WeeklyCard, WeeklyProposalFile, WeeklyPublishedFile } from '../types/weekly';

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const PUBLISHED = 'weekly_curations';
/** Candidate cards the editor threw away: one document per card, id `${poolWeek}_${cardId}`. */
const DISMISSED = 'weekly_dismissed';
/** Weeks whose pools shipped as files before the worker held them. */
const FILE_WEEKS = ['2026-W21', '2026-W20'];

/** A static JSON file, or null: a missing file is answered with the SPA page (200, text/html). */
async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    const text = await res.text();
    return res.ok && text.trimStart().startsWith('{') ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** Weeks with a proposal pool, newest first. */
export async function listProposalWeeks(): Promise<string[]> {
  let weeks: string[] = [];
  try {
    const res = await fetch(`${WORKER_URL}/weekly-proposals`, { cache: 'no-store' });
    if (res.ok) weeks = ((await res.json()) as { weeks?: { week: string }[] }).weeks?.map((w) => w.week) ?? [];
  } catch {
    /* the worker is out of reach: the file weeks still show */
  }
  return Array.from(new Set([...weeks, ...FILE_WEEKS])).sort().reverse();
}

export async function fetchProposal(week: string): Promise<WeeklyProposalFile | null> {
  try {
    const res = await fetch(`${WORKER_URL}/weekly-proposals?week=${encodeURIComponent(week)}`, { cache: 'no-store' });
    if (res.ok) return (await res.json()) as WeeklyProposalFile;
  } catch {
    /* fall back to the file */
  }
  return readJsonFile<WeeklyProposalFile>(`/data/weekly-proposals/${week}.json`);
}

export async function fetchPublished(week: string): Promise<WeeklyPublishedFile | null> {
  try {
    const snap = await getDoc(doc(db, PUBLISHED, week));
    if (snap.exists()) return snap.data() as WeeklyPublishedFile;
  } catch {
    /* fall back to the file */
  }
  return readJsonFile<WeeklyPublishedFile>(`/data/weekly-curations/${week}.json`);
}

/** Published curations from Firestore for weeks up to `upTo`, newest first. */
export async function listPublished(upTo: string, max = 24): Promise<WeeklyPublishedFile[]> {
  try {
    const snap = await getDocs(query(collection(db, PUBLISHED), where('week', '<=', upTo), orderBy('week', 'desc'), limit(max)));
    return snap.docs.map((d) => d.data() as WeeklyPublishedFile);
  } catch {
    return [];
  }
}

/** Publish a card as the week's curation; the app shows it from the next read. Admins only (firestore.rules). */
export async function publishWeekly(week: string, card: WeeklyCard, publishedBy: string): Promise<WeeklyPublishedFile> {
  const { alternates: _alternates, score: _score, ...rest } = card;
  // through JSON: Firestore refuses undefined fields (a work without lqip)
  const published = JSON.parse(JSON.stringify({ ...rest, week, published_at: new Date().toISOString(), published_by: publishedBy })) as WeeklyPublishedFile;
  await setDoc(doc(db, PUBLISHED, week), published);
  return published;
}

/** A candidate card and the week whose pool it came from. */
export type PoolCard = WeeklyCard & { poolWeek: string };

const dismissedKey = (poolWeek: string, cardId: string) => `${poolWeek}_${cardId}`;

/**
 * The candidates to choose from for `week`: that week's own pool, then the cards left over from
 * earlier pools. A card stays a candidate week after week until it is confirmed for some week,
 * published as a special, or thrown away by the editor (dismissCard).
 */
export async function fetchCandidates(week: string): Promise<{ own: PoolCard[]; carried: PoolCard[]; generatedAt: string | null }> {
  const earlier = (await listProposalWeeks()).filter((w) => w < week && !FILE_WEEKS.includes(w));
  const [own, pools, published, dismissedSnap, specials] = await Promise.all([
    fetchProposal(week),
    Promise.all(earlier.map(async (w) => ({ w, pool: await fetchProposal(w) }))),
    listPublished('9999-W99', 100),
    getDocs(collection(db, DISMISSED)).catch(() => null),
    readJsonFile<{ entries: { slug: string }[] }>('/data/special-index.json'),
  ]);
  const dismissed = new Set(dismissedSnap?.docs.map((d) => d.id) ?? []);
  const usedElsewhere = new Set(published.filter((p) => p.week !== week).map((p) => p.id));
  const specialSlugs = (specials?.entries ?? []).map((e) => e.slug);
  const open = (poolWeek: string) => (card: WeeklyCard) =>
    !dismissed.has(dismissedKey(poolWeek, card.id)) &&
    !usedElsewhere.has(card.id) &&
    !specialSlugs.some((slug) => card.id.endsWith(`__${slug}`));
  const tag = (poolWeek: string) => (card: WeeklyCard): PoolCard => ({ ...card, poolWeek });
  const ownCards = (own?.cards ?? []).filter(open(week)).map(tag(week));
  const ownIds = new Set(ownCards.map((c) => c.id));
  const carried = pools.flatMap(({ w, pool }) => (pool?.cards ?? []).filter(open(w)).map(tag(w))).filter((c) => !ownIds.has(c.id));
  return { own: ownCards, carried, generatedAt: own?.generated_at ?? null };
}

/** Throw a candidate away for good: it stops showing in every week. Admins only (firestore.rules). */
export async function dismissCard(card: PoolCard, by: string): Promise<void> {
  await setDoc(doc(db, DISMISSED, dismissedKey(card.poolWeek, card.id)), {
    poolWeek: card.poolWeek, cardId: card.id, title_ko: card.title_ko, by, at: serverTimestamp(),
  });
}
