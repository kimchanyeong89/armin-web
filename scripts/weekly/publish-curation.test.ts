import { describe, it, expect } from 'vitest';
import { publishCuration } from './publish-curation';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function sampleCard(over: Record<string, unknown> = {}) {
  return {
    id: 'yuna-choi__biographical__vilhelm-hammersh-i-birth-1864-05-15',
    persona_id: 'yuna-choi',
    lens: 'biographical',
    trigger: { type: 'anniversary', value: 'x', source: 'y' },
    score: 0.8,
    title_en: 'The Light He Returned To',
    title_ko: '그가 돌아온 빛',
    intro_en: 'I',
    intro_ko: '이',
    subtitle_chip: '',
    works: [
      {
        position: 1,
        role: 'hero',
        artwork_ref: 'aic#1',
        artist: 'Hammershøi',
        title: 'Interior',
        year: '1899',
        image_url: 'https://r2.example/hero.jpg',
        source_collection: 'aic-collection',
        source_url: 'https://aic/1',
        caption_en: '',
        caption_ko: '',
      },
      {
        position: 2,
        role: 'standard',
        artwork_ref: 'aic#2',
        artist: 'Hammershøi',
        title: 'Sunlight',
        year: '1900',
        image_url: 'https://r2.example/other.jpg',
        source_collection: 'aic-collection',
        source_url: 'https://aic/2',
        caption_en: '',
        caption_ko: '',
      },
    ],
    alternates: [{ position: 1 }],
    ...over,
  };
}

describe('publish-curation', () => {
  it('copies the chosen card with publish metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-'));
    try {
      const propPath = join(dir, '2026-W20.json');
      const outDir = join(dir, 'out');
      await writeFile(propPath, JSON.stringify({
        week: '2026-W20',
        generated_at: '2026-05-10T00:00:00Z',
        cards: [
          { id: 'card-a', persona_id: 'yuna-choi', lens: 'biographical', trigger: { type: 'anniversary', value: 'x', source: 'y' }, score: 0.8, title_en: 'T', title_ko: 'ㅌ', intro_en: 'I', intro_ko: '이', subtitle_chip: '', works: [], alternates: [{ position: 1 }] },
          { id: 'card-b', persona_id: 'marco-rinaldi', lens: 'biographical', trigger: { type: 'anniversary', value: 'z', source: 'y' }, score: 0.7, title_en: '...', title_ko: '...', intro_en: '...', intro_ko: '...', subtitle_chip: '', works: [], alternates: [] },
        ],
      }));
      const outPath = await publishCuration({
        week: '2026-W20', cardId: 'card-a', publishedBy: 'tester',
        proposalsDir: dir, outDir,
      });
      const published = JSON.parse(await readFile(outPath, 'utf-8'));
      expect(published.week).toBe('2026-W20');
      expect(published.id).toBe('card-a');
      expect(published.published_by).toBe('tester');
      expect(published.alternates).toBeUndefined();
      expect(published.score).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('publishes as special when --type special, writes to specialsDir + updates index', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-special-'));
    try {
      const propPath = join(dir, '2026-W20.json');
      const specialsDir = join(dir, 'special-series');
      const specialIndexPath = join(dir, 'special-index.json');
      const card = sampleCard({ id: 'card-a' });
      await writeFile(propPath, JSON.stringify({
        week: '2026-W20',
        generated_at: '2026-05-10T00:00:00Z',
        cards: [card],
      }));

      const outPath = await publishCuration({
        week: '2026-W20',
        cardId: 'card-a',
        publishedBy: 'tester',
        type: 'special',
        slug: 'test-slug',
        proposalsDir: dir,
        specialsDir,
        specialIndexPath,
      });

      expect(outPath).toBe(join(specialsDir, 'test-slug.json'));
      const published = JSON.parse(await readFile(outPath, 'utf-8'));
      expect(published.slug).toBe('test-slug');
      expect(published.source_week).toBe('2026-W20');
      expect(published.published_by).toBe('tester');
      expect(published.id).toBe('card-a');
      expect(published.alternates).toBeUndefined();
      expect(published.score).toBeUndefined();

      const index = JSON.parse(await readFile(specialIndexPath, 'utf-8'));
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].slug).toBe('test-slug');
      expect(index.entries[0].title_en).toBe('The Light He Returned To');
      expect(index.entries[0].persona_id).toBe('yuna-choi');
      expect(index.entries[0].hero_image_url).toBe('https://r2.example/hero.jpg');
      expect(index.entries[0].source_week).toBe('2026-W20');
      expect(typeof index.updated_at).toBe('string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('appends to existing special index without overwriting prior entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-special-append-'));
    try {
      const propPath = join(dir, '2026-W20.json');
      const specialsDir = join(dir, 'special-series');
      const specialIndexPath = join(dir, 'special-index.json');
      await writeFile(specialIndexPath, JSON.stringify({
        updated_at: '2026-05-01T00:00:00Z',
        entries: [
          {
            slug: 'alpha',
            title_en: 'Alpha',
            title_ko: '알파',
            persona_id: 'marco-rinaldi',
            lens: 'thematic',
            published_at: '2026-05-01T00:00:00Z',
            hero_image_url: 'https://r2.example/alpha.jpg',
            source_week: '2026-W18',
          },
        ],
      }));
      await writeFile(propPath, JSON.stringify({
        week: '2026-W20',
        generated_at: '2026-05-10T00:00:00Z',
        cards: [sampleCard({ id: 'card-a' })],
      }));

      await publishCuration({
        week: '2026-W20',
        cardId: 'card-a',
        publishedBy: 'tester',
        type: 'special',
        slug: 'beta',
        proposalsDir: dir,
        specialsDir,
        specialIndexPath,
      });

      const index = JSON.parse(await readFile(specialIndexPath, 'utf-8'));
      expect(index.entries).toHaveLength(2);
      expect(index.entries.map((e: { slug: string }) => e.slug)).toEqual(['alpha', 'beta']);
      // both files exist
      await stat(join(specialsDir, 'beta.json'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('de-dups by slug: re-publishing same slug replaces but keeps order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-special-dedup-'));
    try {
      const propPath = join(dir, '2026-W20.json');
      const specialsDir = join(dir, 'special-series');
      const specialIndexPath = join(dir, 'special-index.json');
      await writeFile(propPath, JSON.stringify({
        week: '2026-W20',
        generated_at: '2026-05-10T00:00:00Z',
        cards: [
          sampleCard({ id: 'card-a', title_en: 'First Pass' }),
          sampleCard({ id: 'card-b', title_en: 'Second Pass' }),
        ],
      }));

      await publishCuration({
        week: '2026-W20', cardId: 'card-a', publishedBy: 'tester',
        type: 'special', slug: 'x',
        proposalsDir: dir, specialsDir, specialIndexPath,
      });
      await publishCuration({
        week: '2026-W20', cardId: 'card-b', publishedBy: 'tester',
        type: 'special', slug: 'x',
        proposalsDir: dir, specialsDir, specialIndexPath,
      });

      const index = JSON.parse(await readFile(specialIndexPath, 'utf-8'));
      expect(index.entries).toHaveLength(1);
      expect(index.entries[0].slug).toBe('x');
      expect(index.entries[0].title_en).toBe('Second Pass');

      const published = JSON.parse(await readFile(join(specialsDir, 'x.json'), 'utf-8'));
      expect(published.title_en).toBe('Second Pass');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('derives slug from card id when --slug omitted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-special-derive-'));
    try {
      const propPath = join(dir, '2026-W20.json');
      const specialsDir = join(dir, 'special-series');
      const specialIndexPath = join(dir, 'special-index.json');
      await writeFile(propPath, JSON.stringify({
        week: '2026-W20',
        generated_at: '2026-05-10T00:00:00Z',
        cards: [sampleCard()],
      }));

      const outPath = await publishCuration({
        week: '2026-W20',
        cardId: 'yuna-choi__biographical__vilhelm-hammersh-i-birth-1864-05-15',
        publishedBy: 'tester',
        type: 'special',
        proposalsDir: dir,
        specialsDir,
        specialIndexPath,
      });

      const expectedSlug = 'vilhelm-hammersh-i-birth-1864-05-15';
      expect(outPath).toBe(join(specialsDir, `${expectedSlug}.json`));
      const index = JSON.parse(await readFile(specialIndexPath, 'utf-8'));
      expect(index.entries[0].slug).toBe(expectedSlug);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
