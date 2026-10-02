// Adds a keyword card to a week's proposal pool.
//   npx tsx scripts/weekly/keyword-card.ts --week 2026-W41 --ko 수확 --en harvest \
//     --query "a painting of peasants harvesting wheat" --query "a painting of a harvest festival"
// Each --query is a picture description for the image search (see buildKeywordCard).
// The card is written with empty copy; the writer fills it in before upload.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildKeywordCard } from './generate-proposals';
import type { PersonaId, WeeklyProposalFile } from '../../src/types/weekly';

function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => { if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]); });
  return out;
}

const [week] = args('week');
const [ko] = args('ko');
const [en] = args('en');
const queries = args('query');
const [persona] = args('persona');
if (!week || !/^\d{4}-W\d{2}$/.test(week) || !ko || !en || queries.length === 0) {
  console.error('Usage: tsx keyword-card.ts --week YYYY-Www --ko 키워드 --en keyword --query "a painting of …" [--query …] [--persona id]');
  process.exit(1);
}

const path = join(process.cwd(), 'public', 'data', 'weekly-proposals', `${week}.json`);
const pool: WeeklyProposalFile = await readFile(path, 'utf-8')
  .then((t) => JSON.parse(t) as WeeklyProposalFile)
  .catch(() => ({ week, generated_at: new Date().toISOString(), cards: [] }));

const card = await buildKeywordCard({ ko, en }, queries, { persona: persona as PersonaId | undefined });
if (!card) {
  console.error(`"${ko}": fewer than 7 usable works — try other descriptions`);
  process.exit(2);
}
pool.cards = [...pool.cards.filter((c) => c.id !== card.id), card];
await writeFile(path, JSON.stringify(pool, null, 2));
console.log(`${card.id}: ${card.works.length} works (+${card.alternates.length} alternates) → ${path}`);
for (const w of card.works) console.log(`  ${w.position}. ${w.artist} — ${w.title} (${w.year}) · ${w.source_collection}`);
