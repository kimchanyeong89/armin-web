import type { WeeklyPublishedFile } from '../types/weekly';
import { isoWeek } from './iso-week';

export async function fetchCurrentCuration(
  date: Date = new Date(),
  maxLookback = 12,
): Promise<WeeklyPublishedFile | null> {
  // Try the current ISO week, then walk backwards so an unpublished week
  // shows the most recent real curation instead of the placeholder sample.
  let week = isoWeek(date);
  for (let i = 0; i < maxLookback; i++) {
    try {
      const res = await fetch(`/data/weekly-curations/${week}.json`);
      if (res.ok) return await res.json() as WeeklyPublishedFile;
    } catch {
      // Network error on this week — fall through and try the previous one.
    }
    week = previousWeek(week);
  }
  return null;
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

interface ArchiveIndexFile {
  updated_at: string;
  entries: ArchiveEntry[];
}

/** Decrement an ISO week by one. */
function previousWeek(week: string): string {
  const [yStr, wStr] = week.split('-W');
  const year = parseInt(yStr, 10);
  const w = parseInt(wStr, 10);
  if (w > 1) return `${year}-W${String(w - 1).padStart(2, '0')}`;
  // Wrap to previous year. ISO years have 52 or 53 weeks; assume 52 unless
  // the previous year's W53 file exists. The fallback path below will skip
  // missing files anyway, so 52 is a safe default.
  return `${year - 1}-W52`;
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

/**
 * Fetch the archive list of published weekly curations, newest first.
 *
 * 1) Try `/data/weekly-curations-index.json` (preferred; not yet generated
 *    in V1 — handled gracefully).
 * 2) Fallback: enumerate weeks going backwards from `date`, requesting each
 *    `<week>.json` file. Stop after `maxLookback` attempts, return only the
 *    ones that 200.
 */
export async function fetchArchiveList(
  date: Date = new Date(),
  maxLookback = 12,
): Promise<ArchiveEntry[]> {
  // Preferred path: an explicit index file.
  try {
    const res = await fetch('/data/weekly-curations-index.json');
    if (res.ok) {
      const idx = await res.json() as ArchiveIndexFile;
      return [...idx.entries].sort((a, b) => b.week.localeCompare(a.week));
    }
  } catch {
    // Network error: fall through to enumeration.
  }

  // Fallback: probe backwards from current week.
  const entries: ArchiveEntry[] = [];
  let week = isoWeek(date);
  for (let i = 0; i < maxLookback; i++) {
    try {
      const res = await fetch(`/data/weekly-curations/${week}.json`);
      if (res.ok) {
        const file = await res.json() as WeeklyPublishedFile;
        entries.push(summarizeAsEntry(file));
      }
    } catch {
      // Skip and continue.
    }
    week = previousWeek(week);
  }
  return entries.sort((a, b) => b.week.localeCompare(a.week));
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
