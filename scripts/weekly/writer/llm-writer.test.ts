import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { writeCardCopy, buildWriterPrompt } from './llm-writer';

const sampleInput = {
  persona: { id: 'yuna-choi', name: 'Yuna', role: 'Editor', tone: { sample: 'x', style: 'poetic' } } as any,
  lens: 'biographical' as const,
  trigger: { type: 'anniversary' as const, value: 'Vermeer death', source: 'test' },
  works: [{ position: 1, artist: 'Vermeer', title: 'Woman Reading a Letter', year: '1663' } as any],
};

describe('llm writer', () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('returns empty copy when ANTHROPIC_API_KEY is not set (interactive workflow)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const out = await writeCardCopy(sampleInput);
    expect(out.title_en).toBe('');
    expect(out.title_ko).toBe('');
    expect(out.intro_en).toBe('');
    expect(out.captions).toHaveLength(1);
    expect(out.captions[0]).toEqual({ position: 1, en: '', ko: '' });
  });

  it('calls API and returns bilingual fields when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const out = await writeCardCopy(sampleInput);
    expect(out.title_en).toContain('Quiet');
    expect(out.title_ko).toContain('조용한');
    expect(out.captions[0].en).toBeTruthy();
  });

  it('buildWriterPrompt produces a single source of truth for the prompt body', () => {
    const prompt = buildWriterPrompt(sampleInput);
    expect(prompt).toContain('Persona: Yuna');
    expect(prompt).toContain('Lens: biographical');
    expect(prompt).toContain('Vermeer');
    expect(prompt).toContain('Woman Reading a Letter');
  });
});
