// Task 7 — text→artwork match via the live semantic-search worker.
// Endpoint: POST /search-by-text on https://armin-semantic-search.armin-art.workers.dev
// Request:  { text: string, limit: number }
// Response: { results: Array<{ id: string; e: string; score: number; ... }>, cached: boolean }
//   - `id` is the artwork id within its collection
//   - `e` is the collection slug
//   - `score` is the SigLIP cosine similarity
// We map the worker rows into MatchResult, constructing `artwork_ref` as
// `${collection}#${id}` to align with Task 5's index format.

const DEFAULT_ENDPOINT = 'https://armin-semantic-search.armin-art.workers.dev/search-by-text';
const DEFAULT_TOP_K = 10;
const MIN_QUERY_LENGTH = 2;

export interface MatchResult {
  artwork_ref: string;
  similarity: number;
}

interface WorkerRow {
  id?: string;
  e?: string;        // collection slug
  score?: number;
}

interface WorkerResponse {
  results?: WorkerRow[];
}

export async function matchByText(
  query: string,
  opts: { topK?: number } = {},
): Promise<MatchResult[]> {
  const text = query.trim();
  if (text.length < MIN_QUERY_LENGTH) return [];
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const endpoint = process.env.SEMANTIC_SEARCH_ENDPOINT ?? DEFAULT_ENDPOINT;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, limit: topK }),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let body: WorkerResponse;
  try {
    body = (await res.json()) as WorkerResponse;
  } catch {
    return [];
  }
  const rows = body.results ?? [];

  const out: MatchResult[] = [];
  for (const row of rows) {
    if (!row.id || !row.e || typeof row.score !== 'number') continue;
    out.push({ artwork_ref: `${row.e}#${row.id}`, similarity: row.score });
  }
  return out.slice(0, topK);
}
