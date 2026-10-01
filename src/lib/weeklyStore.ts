// Where the weekly curation lives, in one place.
//
// - Proposals (the candidate pool) come from the semantic-search worker, where the
//   Sunday-morning job puts them (scripts/weekly/upload-proposals.mjs). The old
//   pools shipped as files under /data/weekly-proposals/ are still read.
// - A published curation is a Firestore document, weekly_curations/{week}, written
//   from /admin/weekly by an admin; it is live at once, with no deploy. The weeks
//   published before this (files under /data/weekly-curations/) are still read.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { WeeklyCard, WeeklyProposalFile, WeeklyPublishedFile } from '../types/weekly';

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const PUBLISHED = 'weekly_curations';
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
