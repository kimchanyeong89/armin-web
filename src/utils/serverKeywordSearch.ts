// Server-side keyword search via the Cloudflare Worker `/search-text`
// endpoint. Replaces the 170MB chunked client index for the common case —
// the local worker stays as a fallback for when the server is unreachable
// or the deploy isn't yet seeded.
//
// Response shape from the worker matches the same compact key scheme used
// by the local search worker (n=name, a=artist, m=museum, i=image, …),
// so callers can hand the rows straight into existing renderers.

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';
const SEARCH_TIMEOUT_MS = 4000;

export interface ServerKeywordResult {
    id: string;
    n?: string;
    a?: string;
    m?: string;
    i?: string;
    d?: string;
    e?: string;
    u?: string;
    c?: string;
    rank?: number;
}

let serverHealthy: boolean | null = null;
let lastUnhealthyAt = 0;
const UNHEALTHY_BACKOFF_MS = 30_000;

function isHealthy(): boolean {
    if (serverHealthy === false && Date.now() - lastUnhealthyAt < UNHEALTHY_BACKOFF_MS) return false;
    return true;
}

function markUnhealthy() {
    serverHealthy = false;
    lastUnhealthyAt = Date.now();
}

function markHealthy() {
    serverHealthy = true;
}

/**
 * Search the worker's D1 FTS index by keyword. Returns the empty array on
 * any error or timeout — caller is expected to fall back to the local
 * worker results if needed.
 */
export async function searchTextServer(
    query: string,
    limit = 50,
    signal?: AbortSignal,
): Promise<ServerKeywordResult[]> {
    const trimmed = query?.trim?.() ?? '';
    if (trimmed.length < 2) return [];
    if (!isHealthy()) return [];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
        const res = await fetch(`${WORKER_URL}/search-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            mode: 'cors',
            signal: ctrl.signal,
            body: JSON.stringify({ query: trimmed, limit }),
        });

        if (!res.ok) {
            // 404 = endpoint not deployed yet (worker code is older than this client).
            // 503 = D1 not yet seeded.
            // Either way, stop hammering for the backoff window.
            if (res.status === 404 || res.status === 503) markUnhealthy();
            return [];
        }

        const data = await res.json() as { results?: ServerKeywordResult[] };
        markHealthy();
        return Array.isArray(data?.results) ? data.results : [];
    } catch (err: any) {
        // Network error / timeout / aborted. Don't permanently mark unhealthy
        // for transient failures; just return empty so caller falls back.
        if (err?.name === 'AbortError') return [];
        return [];
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

/** Reset the cached health flag (e.g. after a redeploy). */
export function resetServerKeywordSearchHealth() {
    serverHealthy = null;
    lastUnhealthyAt = 0;
}
