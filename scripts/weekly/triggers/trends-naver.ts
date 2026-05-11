// Task 9 — Naver-flavored Korean realtime trends, via signal.bz aggregator.
// signal.bz exposes a free, unauthenticated JSON endpoint returning the
// current top-10 trending Korean search keywords. Returns [] on any
// network/parse failure so callers can degrade gracefully.
import type { TrendTerm } from './trends-google';
export type { TrendTerm } from './trends-google';

const DEFAULT_ENDPOINT = 'https://api.signal.bz/news/realtime';

interface SignalBzResponse {
  now?: number;
  top10?: Array<{ rank: number; keyword: string; state?: string }>;
}

export async function fetchNaverTrendsKR(
  opts: { limit?: number } = {},
): Promise<TrendTerm[]> {
  const limit = opts.limit ?? 10;
  const endpoint = process.env.NAVER_TRENDS_ENDPOINT ?? DEFAULT_ENDPOINT;
  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'Mozilla/5.0 armin-weekly/1.0' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SignalBzResponse;
    const items = data.top10 ?? [];
    return items.slice(0, limit).map((it) => ({ term: it.keyword }));
  } catch {
    return [];
  }
}
