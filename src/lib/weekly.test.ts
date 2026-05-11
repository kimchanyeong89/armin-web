import { describe, it, expect, vi } from 'vitest';
import { fetchCurrentCuration } from './weekly';

describe('fetchCurrentCuration', () => {
  it('fetches the JSON for the current ISO week', async () => {
    const sample = { week: '2026-W20', id: 'x', title_en: 'T' };
    global.fetch = vi.fn(async (url: any) => ({
      ok: true,
      json: async () => sample,
    })) as any;
    const data = await fetchCurrentCuration();
    expect(data?.week).toBe('2026-W20');
    expect((global.fetch as any).mock.calls[0][0]).toContain('/data/weekly-curations/');
  });

  it('returns null when the file is missing (404)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 })) as any;
    expect(await fetchCurrentCuration()).toBeNull();
  });
});
