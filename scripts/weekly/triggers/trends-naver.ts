// Task 9 — Naver DataLab fetcher (intentional stub).
// The Naver source is still ambiguous: DataLab's public Open API requires
// pre-defined keyword groups (no "what's trending right now" call), and a
// scraping path against Naver search/shopping trends is not yet agreed.
// Until the user picks an approach, this returns [] regardless of env
// vars, so the rest of the L3 pipeline can wire it in without breaking.
export type { TrendTerm } from './trends-google';
import type { TrendTerm } from './trends-google';

export async function fetchNaverDataLabKR(
  _opts: { limit?: number } = {},
): Promise<TrendTerm[]> {
  return [];
}
