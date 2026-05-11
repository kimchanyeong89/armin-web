import { describe, it, expect } from 'vitest';
import { fetchNaverTrendsKR } from './trends-naver';

describe('Naver trends fetcher (via signal.bz)', () => {
  it('returns a non-empty list with shape { term } when endpoint is reachable', async () => {
    const terms = await fetchNaverTrendsKR({ limit: 5 });
    expect(Array.isArray(terms)).toBe(true);
    if (terms.length > 0) {
      expect(typeof terms[0].term).toBe('string');
      expect(terms[0].term.length).toBeGreaterThan(0);
    }
  }, 15000);

  it('returns [] when endpoint is unreachable', async () => {
    const prev = process.env.NAVER_TRENDS_ENDPOINT;
    process.env.NAVER_TRENDS_ENDPOINT = 'https://invalid-domain-that-does-not-exist-1234.test/';
    try {
      const result = await fetchNaverTrendsKR();
      expect(result).toEqual([]);
    } finally {
      if (prev) process.env.NAVER_TRENDS_ENDPOINT = prev;
      else delete process.env.NAVER_TRENDS_ENDPOINT;
    }
  });
});
