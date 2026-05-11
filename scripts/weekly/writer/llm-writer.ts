import Anthropic from '@anthropic-ai/sdk';
import type { Persona } from '../personas';
import type { LensId, Trigger } from '../../../src/types/weekly';
import type { IndexedWork } from '../collection-index';

export interface WriterInput {
  persona: Persona;
  lens: LensId;
  trigger: Trigger;
  works: Array<IndexedWork & { position: number }>;
}

export interface WriterOutput {
  title_en: string;
  title_ko: string;
  intro_en: string;
  intro_ko: string;
  subtitle_chip: string;
  captions: Array<{ position: number; en: string; ko: string }>;
}

const SYSTEM_PROMPT = `You are a curator writing for ARMIN, an art museum app.
You speak as the assigned persona — match their tone exactly.
You produce a weekly curation card with bilingual English + Korean text.
Output VALID JSON ONLY, no markdown, no commentary.`;

export async function writeCardCopy(input: WriterInput): Promise<WriterOutput> {
  const client = new Anthropic();   // reads ANTHROPIC_API_KEY
  const worksList = input.works.map((w) =>
    `  ${w.position}. ${w.artist} — "${w.title}" (${w.year})`,
  ).join('\n');
  const userPrompt = `Persona: ${input.persona.name} (${input.persona.role})
Tone sample: "${input.persona.tone.sample}"
Tone style: ${input.persona.tone.style}

Lens: ${input.lens}
Trigger: ${input.trigger.value}

Works (in display order):
${worksList}

Produce a JSON object with these fields:
- title_en: short evocative English title (4–8 words)
- title_ko: Korean equivalent (not literal translation; match the spirit)
- intro_en: 100–180 word essay introducing the curation, in this persona's voice
- intro_ko: 3–4 sentence Korean gloss (not full translation)
- subtitle_chip: 2–4 Korean characters that name the theme (e.g., "빛과 실내")
- captions: array of { position, en (1 sentence), ko (1 sentence) } for each work`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlock = msg.content.find((b: any) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('no text in LLM response');
  return JSON.parse(textBlock.text) as WriterOutput;
}
