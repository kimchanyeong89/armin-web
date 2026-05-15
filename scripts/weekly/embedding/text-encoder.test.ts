import { describe, it, expect, vi } from 'vitest';
import { encodeText } from './text-encoder';

describe('text encoder', () => {
  it('returns a vector of the expected dimensionality', async () => {
    const v = await encodeText('light in quiet rooms');
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => typeof x === 'number')).toBe(true);
  }, 30000);   // hits live worker /encode; 5s default flakes under load

  it('is deterministic for the same input', async () => {
    const a = await encodeText('test');
    const b = await encodeText('test');
    expect(a).toEqual(b);
  }, 30000);

  it('falls back to deterministic vector when endpoint unreachable', async () => {
    const prev = process.env.SIGLIP_ENCODE_ENDPOINT;
    process.env.SIGLIP_ENCODE_ENDPOINT = 'https://invalid-domain-12345.test/encode';
    vi.resetModules();
    try {
      const mod = await import('./text-encoder');
      const a = await mod.encodeText('xyz');
      const b = await mod.encodeText('xyz');
      expect(a.length).toBe(768);
      expect(a).toEqual(b);
    } finally {
      if (prev) process.env.SIGLIP_ENCODE_ENDPOINT = prev;
      else delete process.env.SIGLIP_ENCODE_ENDPOINT;
    }
  });
});
