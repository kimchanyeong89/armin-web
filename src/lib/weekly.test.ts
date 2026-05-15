import { describe, it, expect, vi } from 'vitest';
import { fetchCurrentCuration, fetchArchiveList, fetchSpecialList } from './weekly';

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

describe('fetchArchiveList', () => {
  it('returns entries from the index file when present, newest-first', async () => {
    const index = {
      updated_at: '2026-05-15T00:00:00Z',
      entries: [
        { week: '2026-W18', title_en: 'A', title_ko: 'ㄱ', persona_id: 'yuna-choi', hero_image_url: '', works_count: 6, published_at: '2026-04-29T00:00:00Z' },
        { week: '2026-W20', title_en: 'C', title_ko: 'ㄷ', persona_id: 'yuna-choi', hero_image_url: '', works_count: 6, published_at: '2026-05-13T00:00:00Z' },
        { week: '2026-W19', title_en: 'B', title_ko: 'ㄴ', persona_id: 'yuna-choi', hero_image_url: '', works_count: 6, published_at: '2026-05-06T00:00:00Z' },
      ],
    };
    global.fetch = vi.fn(async (url: any) => {
      if (url === '/data/weekly-curations-index.json') {
        return { ok: true, json: async () => index };
      }
      return { ok: false };
    }) as any;

    const out = await fetchArchiveList();
    expect(out.map((e) => e.week)).toEqual(['2026-W20', '2026-W19', '2026-W18']);
  });

  it('falls back to enumerating recent weeks when no index exists', async () => {
    const week20 = {
      week: '2026-W20', id: 'a', persona_id: 'yuna-choi', lens: 'biographical',
      trigger: { type: 'anniversary', value: '', source: '' },
      title_en: 'Twenty', title_ko: '이십',
      intro_en: '', intro_ko: '', subtitle_chip: '',
      published_at: '2026-05-13T00:00:00Z', published_by: 'test',
      works: [{ role: 'hero', image_url: 'http://x/20.jpg' }],
    };
    const week18 = {
      week: '2026-W18', id: 'c', persona_id: 'yuna-choi', lens: 'biographical',
      trigger: { type: 'anniversary', value: '', source: '' },
      title_en: 'Eighteen', title_ko: '십팔',
      intro_en: '', intro_ko: '', subtitle_chip: '',
      published_at: '2026-04-29T00:00:00Z', published_by: 'test',
      works: [{ role: 'hero', image_url: 'http://x/18.jpg' }],
    };
    global.fetch = vi.fn(async (url: any) => {
      if (url === '/data/weekly-curations-index.json') return { ok: false, status: 404 };
      if (url === '/data/weekly-curations/2026-W20.json') return { ok: true, json: async () => week20 };
      if (url === '/data/weekly-curations/2026-W18.json') return { ok: true, json: async () => week18 };
      return { ok: false, status: 404 };
    }) as any;

    const out = await fetchArchiveList(new Date('2026-05-15T00:00:00Z'), 4);
    expect(out.map((e) => e.week)).toEqual(['2026-W20', '2026-W18']);
    expect(out[0].hero_image_url).toBe('http://x/20.jpg');
  });
});

describe('fetchSpecialList', () => {
  it('returns entries sorted newest-first by published_at', async () => {
    const index = {
      updated_at: '2026-05-15T00:00:00Z',
      entries: [
        { slug: 'old',    title_en: 'Old',    title_ko: '구', persona_id: 'yuna-choi', lens: 'biographical', published_at: '2026-01-01T00:00:00Z', hero_image_url: '', source_week: '2026-W01' },
        { slug: 'newest', title_en: 'New',    title_ko: '신', persona_id: 'yuna-choi', lens: 'biographical', published_at: '2026-05-01T00:00:00Z', hero_image_url: '', source_week: '2026-W18' },
        { slug: 'mid',    title_en: 'Mid',    title_ko: '중', persona_id: 'yuna-choi', lens: 'biographical', published_at: '2026-03-01T00:00:00Z', hero_image_url: '', source_week: '2026-W09' },
      ],
    };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => index })) as any;
    const out = await fetchSpecialList();
    expect(out.map((e) => e.slug)).toEqual(['newest', 'mid', 'old']);
  });

  it('returns [] when the special index is missing (404)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 })) as any;
    expect(await fetchSpecialList()).toEqual([]);
  });

  it('returns [] on network error', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline'); }) as any;
    expect(await fetchSpecialList()).toEqual([]);
  });
});
