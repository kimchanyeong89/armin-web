import type { Persona } from '../personas';
import type { IndexedWork } from '../collection-index';

function parseYear(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/-?\d{3,4}/);
  return m ? parseInt(m[0], 10) : null;
}

function eraScore(year: number | null, eras: Persona['taste']['eras']): number {
  if (year === null) return 0.3;
  let best = 0;
  for (const e of eras) {
    if (year >= e.range[0] && year <= e.range[1]) best = Math.max(best, e.w);
  }
  return best;
}

function themeScore(work: IndexedWork, themes: string[]): number {
  const hay = `${work.title} ${work.medium ?? ''} ${work.category ?? ''}`.toLowerCase();
  let hits = 0;
  for (const t of themes) {
    if (hay.includes(t.toLowerCase())) hits++;
  }
  return Math.min(1, hits / 3);     // saturates at 3 hits
}

export function scoreWorkForPersona(work: IndexedWork, persona: Persona): number {
  const y = parseYear(work.year);
  const era = eraScore(y, persona.taste.eras);
  const theme = themeScore(work, persona.taste.themes);
  // Region & medium are coarse — skip in V1; they can be added once collection
  // JSONs expose region/country fields consistently.
  return 0.6 * era + 0.4 * theme;
}
