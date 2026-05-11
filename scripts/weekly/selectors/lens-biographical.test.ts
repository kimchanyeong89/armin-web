import { describe, it, expect } from 'vitest';
import { buildBiographicalLens } from './lens-biographical';

describe('biographical lens', () => {
  it('returns up to 10 works for a prolific artist, sorted by year', async () => {
    const works = await buildBiographicalLens('Claude Monet', { count: 10 });
    expect(works.length).toBeGreaterThan(0);
    expect(works.length).toBeLessThanOrEqual(10);
    const years = works.map((w) => parseInt(w.year.match(/-?\d{4}/)?.[0] ?? '0', 10));
    // Should be sorted ascending (or all zeros)
    const sorted = [...years].sort((a, b) => a - b);
    expect(years).toEqual(sorted);
  });
});
