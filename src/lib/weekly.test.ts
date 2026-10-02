import { describe, it, expect, vi } from 'vitest';
import { fetchCurrentCuration, fetchArchiveList, fetchSpecialList } from './weekly';

// Firestore is out of reach in tests, so these exercise the file path.
const file = (week: string, title: string) => ({
  week, id: week, persona_id: 'yuna-choi', lens: 'biographical',
  trigger: { type: 'anniversary', value: '', source: '' },
  title_en: title, title_ko: title, intro_en: '', intro_ko: '', subtitle_chip: '',
  published_at: '2026-05-13T00:00:00Z', published_by: 'test',
  works: [{ role: 'hero', image_url: `http://x/${week}.jpg` }],
});
const serve = (files: Record<string, unknown>) => {
  global.fetch = vi.fn(async (url: any) => {
    const body = files[url];
    return body
      ? { ok: true, json: async () => body, text: async () => JSON.stringify(body) }
      : { ok: false, status: 404, text: async () => '' };
  }) as any;
};

describe('fetchCurrentCuration', () => {
  it("returns the current week's curation", async () => {
    serve({ '/data/weekly-curations/2026-W21.json': file('2026-W21', 'This') });
    const data = await fetchCurrentCuration(new Date('2026-05-21T00:00:00Z'));
    expect(data?.week).toBe('2026-W21');
  });

  it('returns null once the week is over, even when an older week exists', async () => {
    serve({ '/data/weekly-curations/2026-W20.json': file('2026-W20', 'Prev') });
    expect(await fetchCurrentCuration(new Date('2026-05-21T00:00:00Z'))).toBeNull();
  });
});

describe('fetchArchiveList', () => {
  it('lists only weeks before the current one, newest first', async () => {
    serve({
      '/data/weekly-curations/2026-W20.json': file('2026-W20', 'Twenty'),
      '/data/weekly-curations/2026-W21.json': file('2026-W21', 'TwentyOne'),
    });
    expect((await fetchArchiveList(new Date('2026-05-21T00:00:00Z'))).map((e) => e.week)).toEqual(['2026-W20']);
    const later = await fetchArchiveList(new Date('2026-10-01T00:00:00Z'));
    expect(later.map((e) => e.week)).toEqual(['2026-W21', '2026-W20']);
    expect(later[0].hero_image_url).toBe('http://x/2026-W21.jpg');
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
