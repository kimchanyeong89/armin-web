import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isoWeek, weekRange } from '../../src/lib/iso-week';

// Re-export so existing scripts/ callers keep their import path unchanged.
// New code (especially anything in src/) should import directly from
// '../../src/lib/iso-week' to avoid pulling node:fs into the browser bundle.
export { isoWeek, weekRange };

export interface Motif {
  en: string;
  ko: string;
}

interface MotifCalendar {
  default: Motif[];
  monthly: Record<string, Motif[]>;   // "01"..."12"
  weekly: Record<string, Motif[]>;    // "2026-W19"
}

let cache: MotifCalendar | null = null;

async function load(): Promise<MotifCalendar> {
  if (cache) return cache;
  const raw = await readFile(join(process.cwd(), 'data', 'motif-calendar.json'), 'utf-8');
  cache = JSON.parse(raw) as MotifCalendar;
  return cache;
}

export async function motifsForWeek(week: string): Promise<Motif[]> {
  const cal = await load();
  if (cal.weekly[week]) return cal.weekly[week];
  const { start } = weekRange(week);
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  return cal.monthly[mm] ?? cal.default;
}
