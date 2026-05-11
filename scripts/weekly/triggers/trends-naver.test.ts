import { describe, it, expect } from 'vitest';
import { fetchNaverDataLabKR } from './trends-naver';

describe('Naver DataLab KR fetcher (stub)', () => {
  it('returns [] until the source is confirmed', async () => {
    const terms = await fetchNaverDataLabKR({ limit: 5 });
    expect(terms).toEqual([]);
  });
});
