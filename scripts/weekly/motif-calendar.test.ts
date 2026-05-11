import { describe, it, expect } from 'vitest';
import { motifsForWeek, isoWeek } from './motif-calendar';

describe('motif calendar', () => {
  it('isoWeek formats correctly', () => {
    expect(isoWeek(new Date('2026-05-11T12:00:00Z'))).toBe('2026-W20');
    expect(isoWeek(new Date('2026-01-05T12:00:00Z'))).toBe('2026-W02');
  });

  it('returns motifs for any week (fallback to monthly bucket)', async () => {
    const m = await motifsForWeek('2026-W20');
    expect(m.length).toBeGreaterThanOrEqual(1);
    expect(typeof m[0].en).toBe('string');
    expect(typeof m[0].ko).toBe('string');
  });
});
