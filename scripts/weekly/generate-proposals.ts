import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPersonas, PERSONA_IDS } from './personas';
import { motifsForWeek } from './motif-calendar';
import { anniversaryArtistsForWeek } from './triggers/anniversary';
import { fetchGoogleTrendsKR } from './triggers/trends-google';
import { fetchNaverTrendsKR } from './triggers/trends-naver';
import { buildBiographicalLens } from './selectors/lens-biographical';
import { buildThematicLens } from './selectors/lens-thematic';
import { buildDialogueLens } from './selectors/lens-dialogue';
import { scoreWorkForPersona } from './selectors/persona-scorer';
import { writeCardCopy } from './writer/llm-writer';
import { matchByText } from './embedding/match';
import { buildIndex } from './collection-index';
import type { Persona } from './personas';
import type {
  LensId, PersonaId, WeeklyCard, WeeklyProposalFile, WeeklyWork, Trigger,
} from '../../src/types/weekly';

const LENSES: LensId[] = ['biographical', 'thematic', 'dialogue'];
const QUALITY_THRESHOLD = 0.35;
const TREND_MATCH_THRESHOLD = 0.28;
// Design-doc target is 10–20 works per card. 12 reads cleanly for a
// biographical arc (early/mid/late) and gives thematic enough cross-artist
// variety without overwhelming the reader.
const CARD_WORK_COUNT = 12;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

async function buildBaseCellCard(
  persona: Persona,
  lens: LensId,
  anniversaries: Awaited<ReturnType<typeof anniversaryArtistsForWeek>>,
  motifs: Awaited<ReturnType<typeof motifsForWeek>>,
): Promise<WeeklyCard | null> {
  // Try anniversary first (best fit for biographical), then motif.
  if (lens === 'biographical' && anniversaries.length > 0) {
    // Pick the anniversary artist whose works score highest for this persona
    let best: { artist: string; score: number } | null = null;
    for (const a of anniversaries) {
      const works = await buildBiographicalLens(a.name, { count: CARD_WORK_COUNT });
      if (works.length < 6) continue;
      const avg = works.reduce((s, w) => s + scoreWorkForPersona(w, persona), 0) / works.length;
      if (!best || avg > best.score) best = { artist: a.name, score: avg };
    }
    if (!best || best.score < QUALITY_THRESHOLD) return null;
    const aMatch = anniversaries.find((a) => a.name === best!.artist)!;
    const works = await buildBiographicalLens(best.artist, { count: CARD_WORK_COUNT });
    const trigger: Trigger = {
      type: 'anniversary',
      value: `${best.artist} · ${aMatch.kind} ${aMatch.date}`,
      source: 'artists-dates.json',
    };
    return await emitCard(persona, lens, trigger, works, best.score);
  }

  if (lens === 'thematic' && motifs.length > 0) {
    const motif = motifs[0];
    const works = await buildThematicLens(motif.en, { count: CARD_WORK_COUNT });
    if (works.length < 6) return null;
    const avg = works.reduce((s, w) => s + scoreWorkForPersona(w, persona), 0) / works.length;
    if (avg < QUALITY_THRESHOLD) return null;
    const trigger: Trigger = {
      type: 'motif',
      value: `${motif.en} / ${motif.ko}`,
      source: 'motif-calendar.json',
    };
    return await emitCard(persona, lens, trigger, works, avg);
  }

  if (lens === 'dialogue' && anniversaries.length >= 2) {
    const [a, b] = anniversaries;
    const works = await buildDialogueLens(a.name, b.name, { perArtist: 5 });
    if (works.length < 6) return null;
    const avg = works.reduce((s, w) => s + scoreWorkForPersona(w, persona), 0) / works.length;
    if (avg < QUALITY_THRESHOLD) return null;
    const trigger: Trigger = {
      type: 'anniversary',
      value: `${a.name} × ${b.name}`,
      source: 'artists-dates.json',
    };
    return await emitCard(persona, lens, trigger, works, avg);
  }

  return null;
}

async function emitCard(
  persona: Persona,
  lens: LensId,
  trigger: Trigger,
  works: Awaited<ReturnType<typeof buildBiographicalLens>>,
  score: number,
): Promise<WeeklyCard> {
  const positioned: Array<typeof works[number] & { position: number }> = works.map((w, i) => ({
    ...w, position: i + 1,
  }));
  const copy = await writeCardCopy({ persona, lens, trigger, works: positioned });
  const cardWorks: WeeklyWork[] = positioned.map((w, i) => {
    const cap = copy.captions.find((c) => c.position === w.position);
    return {
      position: w.position,
      role: i === 0 ? 'hero' : 'standard',
      artwork_ref: w.artwork_ref,
      artist: w.artist,
      title: w.title,
      year: w.year,
      image_url: w.image_url,
      source_collection: w.source_collection,
      source_url: w.source_url,
      lqip: w.lqip,
      caption_en: cap?.en ?? '',
      caption_ko: cap?.ko ?? '',
    };
  });
  return {
    id: `${persona.id}__${lens}__${slug(trigger.value)}`,
    persona_id: persona.id as PersonaId,
    lens,
    trigger,
    score,
    title_en: copy.title_en,
    title_ko: copy.title_ko,
    intro_en: copy.intro_en,
    intro_ko: copy.intro_ko,
    subtitle_chip: copy.subtitle_chip,
    works: cardWorks,
    alternates: [],
  };
}

async function buildTrendCard(
  persona: Persona,
  term: string,
  source: 'trend-google' | 'trend-naver',
): Promise<WeeklyCard | null> {
  const matches = await matchByText(term, { topK: CARD_WORK_COUNT * 4 });
  const top = matches[0];
  if (!top || top.similarity < TREND_MATCH_THRESHOLD) return null;
  const works = await buildThematicLens(term, { count: CARD_WORK_COUNT });
  if (works.length < 6) return null;
  const avg = works.reduce((s, w) => s + scoreWorkForPersona(w, persona), 0) / works.length;
  if (avg < QUALITY_THRESHOLD) return null;
  const trigger: Trigger = {
    type: source,
    value: term,
    source: source === 'trend-google' ? 'trends.google.co.kr' : 'datalab.naver.com',
    similarity: top.similarity,
  };
  return await emitCard(persona, 'thematic', trigger, works, avg);
}

export async function generateProposals(
  week: string,
  opts: { outDir?: string } = {},
): Promise<string> {
  const outDir = opts.outDir ?? join(process.cwd(), 'public', 'data', 'weekly-proposals');
  await mkdir(outDir, { recursive: true });
  await buildIndex();   // warm up

  const personas = await loadPersonas();
  const [anniversaries, motifs, gTrends, nTrends] = await Promise.all([
    anniversaryArtistsForWeek(week),
    motifsForWeek(week),
    fetchGoogleTrendsKR({ limit: 10 }),
    fetchNaverTrendsKR(),
  ]);

  const cards: WeeklyCard[] = [];

  // 3 × 3 base matrix
  for (const pid of PERSONA_IDS) {
    for (const lens of LENSES) {
      const c = await buildBaseCellCard(personas[pid], lens, anniversaries, motifs);
      if (c) cards.push(c);
    }
  }

  // Trend cards — try each persona for top 3 of each source
  for (const t of gTrends.slice(0, 3)) {
    for (const pid of PERSONA_IDS) {
      const c = await buildTrendCard(personas[pid], t.term, 'trend-google');
      if (c) { cards.push(c); break; }   // one persona per term
    }
  }
  for (const t of nTrends.slice(0, 3)) {
    for (const pid of PERSONA_IDS) {
      const c = await buildTrendCard(personas[pid], t.term, 'trend-naver');
      if (c) { cards.push(c); break; }
    }
  }

  const file: WeeklyProposalFile = {
    week,
    generated_at: new Date().toISOString(),
    cards,
  };
  const path = join(outDir, `${week}.json`);
  await writeFile(path, JSON.stringify(file, null, 2));
  return path;
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const argIdx = process.argv.indexOf('--week');
  const week = argIdx >= 0 ? process.argv[argIdx + 1] : undefined;
  if (!week) {
    console.error('Usage: tsx generate-proposals.ts --week YYYY-Www');
    process.exit(1);
  }
  generateProposals(week)
    .then((p) => console.log(`Wrote ${p}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
