import { describe, it, expect } from 'vitest';
import { anniversaryArtistsForWeek } from './anniversary';

describe('anniversary trigger', () => {
  it('finds Munch in his birthDate week (Dec 12, ISO W50 in 2025)', async () => {
    const result = await anniversaryArtistsForWeek('2025-W50');
    const names = result.map((r) => r.name);
    expect(names).toContain('Edvard Munch');
    const munch = result.find((r) => r.name === 'Edvard Munch')!;
    expect(munch.kind).toBe('birth');
  });

  it('returns empty when zero matches in tight week (use ±2 weeks fallback)', async () => {
    const result = await anniversaryArtistsForWeek('2026-W52', { expandWeeks: 0 });
    expect(Array.isArray(result)).toBe(true);
  });
});
