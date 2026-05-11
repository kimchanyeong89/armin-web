import { describe, it, expect } from 'vitest';
import { matchByText } from './match';

describe('embedding match', () => {
  it('returns a ranked list of artwork refs with similarity', async () => {
    const results = await matchByText('light in quiet rooms', { topK: 10 });
    expect(results.length).toBeLessThanOrEqual(10);
    if (results.length > 0) {
      expect(results[0].artwork_ref).toBeTruthy();
      expect(typeof results[0].similarity).toBe('number');
    }
  }, 15000);
});
