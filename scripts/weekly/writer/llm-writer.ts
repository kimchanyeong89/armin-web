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

/**
 * Build the writer prompt as plain text. Exposed so an interactive Claude Code
 * session (no API needed) can read a proposal card and write the copy by hand.
 * Same prompt body the API path uses below — single source of truth.
 */
export function buildWriterPrompt(input: WriterInput): string {
  const worksList = input.works.map((w) =>
    `  ${w.position}. ${w.artist} — "${w.title}" (${w.year})`,
  ).join('\n');
  return `Persona: ${input.persona.name} (${input.persona.role})
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
}

/**
 * Returns empty copy fields (no API call). Used when ANTHROPIC_API_KEY is not
 * set — the cards land in the proposal file with empty text, and a human (or
 * Claude in an interactive Claude Code session) fills them in by editing the
 * JSON directly. The user's chosen workflow: no extra API spend, copy gets
 * written each week inside our conversation using the Claude Code subscription.
 */
function emptyCopy(input: WriterInput): WriterOutput {
  return {
    title_en: '',
    title_ko: '',
    intro_en: '',
    intro_ko: '',
    subtitle_chip: '',
    captions: input.works.map((w) => ({ position: w.position, en: '', ko: '' })),
  };
}

export async function writeCardCopy(input: WriterInput): Promise<WriterOutput> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return emptyCopy(input);
  }
  const client = new Anthropic();   // reads ANTHROPIC_API_KEY
  const userPrompt = buildWriterPrompt(input);
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
