// Task 8 — Google Trends KR daily-trending fetcher.
// Source: https://trends.google.com/trending/rss?geo=KR&hl=ko
// Parses the RSS feed and returns up to `limit` { term, traffic } entries.
// On any network/parse failure returns [] so callers can degrade gracefully.
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_ENDPOINT = 'https://trends.google.com/trending/rss?geo=KR&hl=ko';
const DEFAULT_LIMIT = 20;

export interface TrendTerm {
  term: string;
  traffic?: string;     // e.g. "100K+" — provided by Google when available
}

interface RssItem {
  title?: string | { '#text'?: string };
  ['ht:approx_traffic']?: string;
}

interface RssShape {
  rss?: { channel?: { item?: RssItem | RssItem[] } };
}

function toText(v: RssItem['title']): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v['#text'] ?? '';
}

export async function fetchGoogleTrendsKR(
  opts: { limit?: number } = {},
): Promise<TrendTerm[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const endpoint = process.env.GOOGLE_TRENDS_ENDPOINT ?? DEFAULT_ENDPOINT;

  let res: Response;
  try {
    res = await fetch(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0 armin-weekly/1.0' } });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let xml: string;
  try {
    xml = await res.text();
  } catch {
    return [];
  }

  let parsed: RssShape;
  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    parsed = parser.parse(xml) as RssShape;
  } catch {
    return [];
  }

  const itemRaw = parsed.rss?.channel?.item;
  const items: RssItem[] = Array.isArray(itemRaw) ? itemRaw : itemRaw ? [itemRaw] : [];
  const out: TrendTerm[] = [];
  for (const it of items) {
    const term = toText(it.title).trim();
    if (!term) continue;
    const traffic = it['ht:approx_traffic'];
    out.push(traffic ? { term, traffic } : { term });
    if (out.length >= limit) break;
  }
  return out;
}
