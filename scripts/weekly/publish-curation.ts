import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WeeklyProposalFile, WeeklyPublishedFile } from '../../src/types/weekly';

export interface PublishOpts {
  week: string;
  cardId: string;
  publishedBy: string;
  proposalsDir?: string;
  outDir?: string;
}

export async function publishCuration(opts: PublishOpts): Promise<string> {
  const proposalsDir = opts.proposalsDir ?? join(process.cwd(), 'data', 'weekly-proposals');
  const outDir = opts.outDir ?? join(process.cwd(), 'public', 'data', 'weekly-curations');
  const proposalPath = join(proposalsDir, `${opts.week}.json`);
  const file = JSON.parse(await readFile(proposalPath, 'utf-8')) as WeeklyProposalFile;
  const card = file.cards.find((c) => c.id === opts.cardId);
  if (!card) throw new Error(`card ${opts.cardId} not found in ${proposalPath}`);

  const { alternates: _a, score: _s, ...rest } = card;
  const published: WeeklyPublishedFile = {
    ...rest,
    week: opts.week,
    published_at: new Date().toISOString(),
    published_by: opts.publishedBy,
  };
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${opts.week}.json`);
  await writeFile(outPath, JSON.stringify(published, null, 2));
  return outPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv;
  const week = argv[argv.indexOf('--week') + 1];
  const cardId = argv[argv.indexOf('--card') + 1];
  const publishedBy = process.env.USER ?? 'editor';
  if (!week || !cardId) {
    console.error('Usage: tsx publish-curation.ts --week YYYY-Www --card <cardId>');
    process.exit(1);
  }
  publishCuration({ week, cardId, publishedBy })
    .then((p) => console.log(`Published to ${p}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
