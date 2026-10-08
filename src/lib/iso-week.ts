// Pure ISO-8601 week utilities. No Node imports — safe to use from browser code
// (src/) and from Node scripts (scripts/weekly/). Single source of truth for
// week math across the weekly curation pipeline.

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

/** "2026-W41" → "10월 2주차 (W41)" (en: "Oct week 2 (W41)"): the month and week-of-month of the week's Thursday. */
export function weekLabel(week: string, ko = true): string {
  const m = /^\d{4}-W(\d{2})$/.exec(week ?? '');
  if (!m) return week ?? '';
  const thu = new Date(weekRange(week).start);
  thu.setUTCDate(thu.getUTCDate() + 3);
  const nth = Math.ceil(thu.getUTCDate() / 7);
  const month = ko ? `${thu.getUTCMonth() + 1}월` : thu.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return ko ? `${month} ${nth}주차 (W${m[1]})` : `${month} week ${nth} (W${m[1]})`;
}

/** The week the app shows as "this week". It turns over on Monday 07:00 Korea time (Sunday 22:00 UTC),
 *  so a curation confirmed ahead for a week goes on show by itself at that hour. */
export function liveWeek(now: Date = new Date()): string {
  return isoWeek(new Date(now.getTime() + 2 * 3600_000));
}

/** When a week goes on show, for people: "10/12(월) 오전 7시". */
export function liveFromLabel(week: string): string {
  const { start } = weekRange(week);
  return `${start.getUTCMonth() + 1}/${start.getUTCDate()}(월) 오전 7시`;
}
