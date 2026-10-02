import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { weekRange } from '../motif-calendar';

interface ArtistsDatesEntry {
  name: string;
  birthDate?: string;       // "YYYY.MM.DD"
  deathDate?: string;
  wikiId?: string;
}

export interface AnniversaryMatch {
  name: string;
  kind: 'birth' | 'death';
  date: string;             // YYYY.MM.DD as stored
  years: number;            // which anniversary falls in the week, e.g. 100
}

/**
 * Only round anniversaries make a candidate: a birth or death date falls in almost
 * every week, a 50th or a 100th does not, and those suit a special edition.
 * Editorial rule (2026-10-02): 10, 20, 25, 50, 60, 150, and every 100 (100, 200, 300…).
 */
const ROUND_YEARS = [10, 20, 25, 50, 60, 150];
export function isRoundAnniversary(years: number): boolean {
  return ROUND_YEARS.includes(years) || (years > 0 && years % 100 === 0);
}

let cache: Record<string, ArtistsDatesEntry> | null = null;

async function loadArtists(): Promise<Record<string, ArtistsDatesEntry>> {
  if (cache) return cache;
  const raw = await readFile(join(process.cwd(), 'public', 'data', 'artists-dates.json'), 'utf-8');
  cache = JSON.parse(raw);
  return cache!;
}

function parseDot(d: string): { month: number; day: number } | null {
  const m = d.match(/^\d{4}\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
}

function inRange(md: { month: number; day: number }, start: Date, end: Date): boolean {
  // Check whether any day between start..end (inclusive, UTC) matches md.month/md.day, ignoring year.
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCMonth() + 1 === md.month && d.getUTCDate() === md.day) return true;
  }
  return false;
}

export async function anniversaryArtistsForWeek(
  week: string,
  opts: { expandWeeks?: number } = {},
): Promise<AnniversaryMatch[]> {
  const expand = opts.expandWeeks ?? 2;
  const artists = await loadArtists();
  const { start, end } = weekRange(week);
  // Apply expansion: shift start backward, end forward by expand weeks worth of days
  const wideStart = new Date(start); wideStart.setUTCDate(start.getUTCDate() - expand * 7);
  const wideEnd = new Date(end); wideEnd.setUTCDate(end.getUTCDate() + expand * 7);

  // The anniversary is counted from the year of the week's Thursday (its ISO year).
  const year = new Date(start.getTime() + 3 * 86400000).getUTCFullYear();
  // First pass: tight window
  const matches = collectMatches(artists, start, end, year);
  if (matches.length > 0 || expand === 0) return matches;
  // Expanded
  return collectMatches(artists, wideStart, wideEnd, year);
}

function collectMatches(
  artists: Record<string, ArtistsDatesEntry>,
  start: Date,
  end: Date,
  year: number,
): AnniversaryMatch[] {
  const out: AnniversaryMatch[] = [];
  for (const entry of Object.values(artists)) {
    for (const kind of ['birth', 'death'] as const) {
      const date = kind === 'birth' ? entry.birthDate : entry.deathDate;
      const md = date ? parseDot(date) : null;
      if (!date || !md || !inRange(md, start, end)) continue;
      const years = year - parseInt(date.slice(0, 4), 10);
      if (isRoundAnniversary(years)) out.push({ name: entry.name, kind, date, years });
    }
  }
  return out;
}
