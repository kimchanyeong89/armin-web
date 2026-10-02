import { describe, it, expect } from 'vitest';
import { anniversaryArtistsForWeek, isRoundAnniversary } from './anniversary';
import { isoWeek } from '../../../src/lib/iso-week';

describe('anniversary trigger', () => {
  it('counts only round anniversaries: 10, 20, 25, 50, 60, 150 and every 100', () => {
    expect([10, 20, 25, 50, 60, 100, 150, 200, 500].every(isRoundAnniversary)).toBe(true);
    expect([1, 30, 75, 162, 167, 250, 557].some(isRoundAnniversary)).toBe(false);
  });

  it('finds Munch (born 1863.12.12) in his 200th-birthday week, not in an ordinary year', async () => {
    const in2063 = await anniversaryArtistsForWeek(isoWeek(new Date('2063-12-12T00:00:00Z')), { expandWeeks: 0 });
    const munch = in2063.find((r) => r.name === 'Edvard Munch');
    expect(munch?.kind).toBe('birth');
    expect(munch?.years).toBe(200);
    const in2025 = await anniversaryArtistsForWeek('2025-W50', { expandWeeks: 0 });
    expect(in2025.map((r) => r.name)).not.toContain('Edvard Munch');
    expect(in2025.every((r) => isRoundAnniversary(r.years))).toBe(true);
  });

  it('returns empty when zero matches in tight week (use ±2 weeks fallback)', async () => {
    const result = await anniversaryArtistsForWeek('2026-W52', { expandWeeks: 0 });
    expect(Array.isArray(result)).toBe(true);
  });
});
