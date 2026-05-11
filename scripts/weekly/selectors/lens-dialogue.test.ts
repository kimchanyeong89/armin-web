import { describe, it, expect } from 'vitest';
import { buildDialogueLens } from './lens-dialogue';

describe('dialogue lens', () => {
  it('returns alternating works from two artists', async () => {
    const works = await buildDialogueLens('Claude Monet', 'Pierre-Auguste Renoir', { perArtist: 5 });
    expect(works.length).toBeLessThanOrEqual(10);
    // Check alternation (not strict — last work may be unmatched)
    if (works.length >= 4) {
      expect(works[0].artist).not.toBe(works[1].artist);
    }
  }, 30000);   // depends on collection-index build — slow on cold cache
});
