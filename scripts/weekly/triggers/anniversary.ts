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

  // First pass: tight window
  let matches = collectMatches(artists, start, end);
  if (matches.length > 0 || expand === 0) return matches;
  // Expanded
  return collectMatches(artists, wideStart, wideEnd);
}

function collectMatches(
  artists: Record<string, ArtistsDatesEntry>,
  start: Date,
  end: Date,
): AnniversaryMatch[] {
  const out: AnniversaryMatch[] = [];
  for (const entry of Object.values(artists)) {
    if (entry.birthDate) {
      const md = parseDot(entry.birthDate);
      if (md && inRange(md, start, end)) out.push({ name: entry.name, kind: 'birth', date: entry.birthDate });
    }
    if (entry.deathDate) {
      const md = parseDot(entry.deathDate);
      if (md && inRange(md, start, end)) out.push({ name: entry.name, kind: 'death', date: entry.deathDate });
    }
  }
  return out;
}
