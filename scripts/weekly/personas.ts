import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PersonaId } from '../../src/types/weekly';

export const PERSONA_IDS: PersonaId[] = ['yuna-choi', 'marco-rinaldi', 'anika-voss'];

export interface Persona {
  id: PersonaId;
  name: string;
  role: string;
  avatar: string;
  language_primary: string;
  language_gloss: string;
  taste: {
    eras: Array<{ range: [number, number]; w: number }>;
    regions: Record<string, number>;
    media: string[];
    themes: string[];
  };
  lensAffinity: { biographical: number; thematic: number; dialogue: number };
  tone: { style: string; sentence: string; punctuation: string[]; sample: string };
}

const PERSONAS_DIR = join(process.cwd(), 'data', 'personas');

export async function loadPersonas(): Promise<Record<PersonaId, Persona>> {
  const entries = await Promise.all(
    PERSONA_IDS.map(async (id) => {
      const raw = await readFile(join(PERSONAS_DIR, `${id}.json`), 'utf-8');
      return [id, JSON.parse(raw) as Persona] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<PersonaId, Persona>;
}
