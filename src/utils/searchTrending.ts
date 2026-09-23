// The "trending now" board on the search page: what everyone has been
// searching for, counted by the worker (D1 `search_hits`), not only what this
// browser has typed. `reportSearchHit` sends a search once it has shown
// results; `fetchTrending` reads the week's top terms with last week's rank.
//
// A development server never reports, so trying things out locally does not
// put "test" on the board everyone sees; it still reads the live board.

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const TRENDING_TIMEOUT_MS = 3500;

export interface TrendingTerm {
    term: string;
    hits: number;
    rank: number;
    /** where the term stood the week before, or null when it is new */
    previousRank: number | null;
}

/* the same search typed again in one sitting is one search, not several */
const reported = new Set<string>();

export function reportSearchHit(term: string): void {
    const trimmed = String(term || '').replace(/\s+/g, ' ').trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length < 2 || reported.has(key) || import.meta.env.DEV) return;
    reported.add(key);
    fetch(`${WORKER_URL}/search-hit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: trimmed }),
        keepalive: true,
    }).catch(() => { /* a miss here only leaves the board a little behind */ });
}

export async function fetchTrending(): Promise<TrendingTerm[]> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TRENDING_TIMEOUT_MS);
    try {
        const res = await fetch(`${WORKER_URL}/trending`, { signal: controller.signal });
        if (!res.ok) return [];
        const data = await res.json() as { terms?: TrendingTerm[] };
        return Array.isArray(data?.terms) ? data.terms.filter((t) => t && typeof t.term === 'string') : [];
    } catch {
        return [];
    } finally {
        window.clearTimeout(timer);
    }
}
