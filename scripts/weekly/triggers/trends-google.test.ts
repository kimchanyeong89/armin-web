import { describe, it, expect } from 'vitest';
import { fetchGoogleTrendsKR } from './trends-google';

describe('Google Trends KR fetcher', () => {
  it('returns a non-empty list with shape { term, traffic }', async () => {
    const terms = await fetchGoogleTrendsKR({ limit: 5 });
    expect(Array.isArray(terms)).toBe(true);
    if (terms.length > 0) {
      expect(typeof terms[0].term).toBe('string');
      expect(terms[0].term.length).toBeGreaterThan(0);
    }
  }, 15000);
});
