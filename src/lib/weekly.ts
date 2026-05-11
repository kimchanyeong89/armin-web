import type { WeeklyPublishedFile } from '../types/weekly';
import { isoWeek } from './iso-week';

export async function fetchCurrentCuration(
  date: Date = new Date(),
): Promise<WeeklyPublishedFile | null> {
  const week = isoWeek(date);
  const res = await fetch(`/data/weekly-curations/${week}.json`);
  if (!res.ok) return null;
  return await res.json() as WeeklyPublishedFile;
}
