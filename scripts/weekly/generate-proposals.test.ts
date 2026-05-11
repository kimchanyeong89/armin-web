import { describe, it, expect, vi } from 'vitest';
import { generateProposals } from './generate-proposals';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('./writer/llm-writer', () => ({
  writeCardCopy: async () => ({
    title_en: 'T', title_ko: 'ㅌ', intro_en: 'I', intro_ko: '이',
    subtitle_chip: 'ㅊ', captions: [],
  }),
}));

describe('generate-proposals orchestrator', () => {
  it('writes a valid proposal file with at least 1 card', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'weekly-'));
    try {
      const path = await generateProposals('2025-W50', { outDir });   // Munch week
      const file = JSON.parse(await readFile(path, 'utf-8'));
      expect(file.week).toBe('2025-W50');
      expect(Array.isArray(file.cards)).toBe(true);
      expect(file.cards.length).toBeGreaterThan(0);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 30000);
});
