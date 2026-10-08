import type { WeeklyPublishedFile } from '../types/weekly';
import { liveWeek } from './iso-week';
import { fetchPublished, listPublished } from './weeklyStore';

/** Weeks published as files before /admin/weekly existed, to list among past weeks. The May weeks
 *  ('2026-W21', '2026-W20') were taken off the list on 2026-10-07; their files stay, so saved copies still open. */
const PUBLISHED_FILE_WEEKS: string[] = [];

/**
 * This week's curation, or null. Only the week on show counts (liveWeek: from Monday 07:00 KST): once a week is
 * over its curation belongs to the archive, never to "this week".
 */
export async function fetchCurrentCuration(date: Date = new Date()): Promise<WeeklyPublishedFile | null> {
  return fetchPublished(liveWeek(date));
}

// ── Archive list ────────────────────────────────────────────────────────────
// Lightweight entry for archive grid cards. Shape mirrors the in-repo
// publish-CLI index entry but only carries fields the UI needs.

export interface ArchiveEntry {
  week: string;                    // "2026-W20"
  title_en: string;
  title_ko: string;
  persona_id: string;
  hero_image_url: string;
  works_count: number;
  published_at: string;
}

function summarizeAsEntry(file: WeeklyPublishedFile): ArchiveEntry {
  const hero = file.works.find((w) => w.role === 'hero') ?? file.works[0];
  return {
    week: file.week,
    title_en: file.title_en,
    title_ko: file.title_ko,
    persona_id: file.persona_id,
    hero_image_url: hero?.image_url ?? '',
    works_count: file.works.length,
    published_at: file.published_at,
  };
}

/** Past weekly curations (weeks before `date`'s week), newest first. */
export async function fetchArchiveList(date: Date = new Date()): Promise<ArchiveEntry[]> {
  const thisWeek = liveWeek(date);
  // Published from /admin/weekly (Firestore), joined by the file weeks; a week in both is the Firestore one.
  const fromStore = (await listPublished(thisWeek)).map(summarizeAsEntry);
  const seen = new Set(fromStore.map((e) => e.week));
  const fromFiles: ArchiveEntry[] = [];
  for (const week of PUBLISHED_FILE_WEEKS) {
    if (seen.has(week)) continue;
    try {
      const res = await fetch(`/data/weekly-curations/${week}.json`);
      if (res.ok) fromFiles.push(summarizeAsEntry(await res.json() as WeeklyPublishedFile));
    } catch {
      // Skip a file that is out of reach.
    }
  }
  return [...fromStore, ...fromFiles]
    .filter((e) => e.week < thisWeek)
    .sort((a, b) => b.week.localeCompare(a.week));
}

// ── Special series list ─────────────────────────────────────────────────────

export interface SpecialEntry {
  slug: string;
  title_en: string;
  title_ko: string;
  persona_id: string;
  lens: string;
  published_at: string;
  hero_image_url: string;
  source_week: string;
}

interface SpecialIndexFile {
  updated_at: string;
  entries: SpecialEntry[];
}

/**
 * Fetch the special-series list, newest first. Returns an empty array if the
 * index file is missing (V1: publish-CLI may not have generated it yet).
 */
export async function fetchSpecialList(): Promise<SpecialEntry[]> {
  try {
    const res = await fetch('/data/special-index.json');
    if (!res.ok) return [];
    const idx = await res.json() as SpecialIndexFile;
    return [...idx.entries].sort((a, b) =>
      b.published_at.localeCompare(a.published_at),
    );
  } catch {
    return [];
  }
}
