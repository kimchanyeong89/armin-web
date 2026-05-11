import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

export function isoWeek(d: Date): string {
  // ISO-8601 week: Thursday-anchored
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function weekRange(week: string): { start: Date; end: Date } {
  // Parse "2026-W20" → Monday..Sunday in UTC
  const [yStr, wStr] = week.split('-W');
  const year = parseInt(yStr, 10);
  const w = parseInt(wStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const start = new Date(week1Mon);
  start.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

export async function motifsForWeek(week: string): Promise<Motif[]> {
  const cal = await load();
  if (cal.weekly[week]) return cal.weekly[week];
  const { start } = weekRange(week);
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  return cal.monthly[mm] ?? cal.default;
}
