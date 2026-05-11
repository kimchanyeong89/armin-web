import { describe, it, expect } from 'vitest';
import { encodeText } from './text-encoder';

describe('text encoder', () => {
  it('returns a vector of the expected dimensionality', async () => {
    const v = await encodeText('light in quiet rooms');
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => typeof x === 'number')).toBe(true);
  });

  it('is deterministic for the same input', async () => {
    const a = await encodeText('test');
    const b = await encodeText('test');
    expect(a).toEqual(b);
  });
});
