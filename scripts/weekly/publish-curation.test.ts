import { describe, it, expect } from 'vitest';
import { publishCuration } from './publish-curation';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
});
