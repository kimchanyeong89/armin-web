import { describe, it, expect } from 'vitest';
import { buildThematicLens } from './lens-thematic';

describe('thematic lens', () => {
  it('returns 10–12 works with artist diversity (≤3 per artist)', async () => {
    const works = await buildThematicLens('light in quiet rooms', { count: 10 });
    expect(works.length).toBeLessThanOrEqual(12);
    const counts = new Map<string, number>();
    for (const w of works) counts.set(w.artist, (counts.get(w.artist) ?? 0) + 1);
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(3);
  });
});
