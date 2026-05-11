import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            title_en: 'Things That Glow in Quiet Rooms',
            title_ko: '조용한 방에서 빛나는 것들',
            intro_en: 'There is a particular quality of light...',
            intro_ko: '화가들이 늘 좇아온 빛의 한 결...',
            subtitle_chip: '빛과 실내',
            captions: [
              { position: 1, en: 'The first letter.', ko: '첫 번째 편지.' },
            ],
          }),
        }],
      }),
    };
  },
}));

import { writeCardCopy } from './llm-writer';

describe('llm writer', () => {
  it('produces bilingual fields and per-work captions', async () => {
    const out = await writeCardCopy({
      persona: { id: 'yuna-choi', name: 'Yuna', tone: { sample: 'x', style: 'poetic' } } as any,
      lens: 'biographical',
      trigger: { type: 'anniversary', value: 'Vermeer death', source: 'test' },
      works: [{ position: 1, artist: 'Vermeer', title: 'Woman Reading a Letter', year: '1663' } as any],
    });
    expect(out.title_en).toContain('Quiet');
    expect(out.title_ko).toContain('조용한');
    expect(out.captions[0].en).toBeTruthy();
  });
});
