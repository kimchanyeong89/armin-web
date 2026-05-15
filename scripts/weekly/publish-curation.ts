import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WeeklyCard,
  WeeklyProposalFile,
  WeeklyPublishedFile,
} from '../../src/types/weekly';

export type PublishType = 'weekly' | 'special';

export interface PublishOpts {
  week: string;
  cardId: string;
  publishedBy: string;
  type?: PublishType;
  slug?: string;
  proposalsDir?: string;
  outDir?: string;
  specialsDir?: string;
  specialIndexPath?: string;
}

export interface SpecialIndexEntry {
  slug: string;
  title_en: string;
  title_ko: string;
  persona_id: string;
  lens: string;
  published_at: string;
  hero_image_url: string;
  source_week: string;
}

export interface SpecialIndexFile {
  updated_at: string;
  entries: SpecialIndexEntry[];
}

/** Strip editorial-only fields from a candidate card to produce its published shape. */
function stripCardForPublish(card: WeeklyCard): Omit<WeeklyCard, 'alternates' | 'score'> {
  const { alternates: _a, score: _s, ...rest } = card;
  return rest;
}

/** Pick the hero work's image URL (fallback to first work). */
function heroImageUrl(card: WeeklyCard): string {
  const hero = card.works.find((w) => w.role === 'hero') ?? card.works[0];
  return hero?.image_url ?? '';
}

/** Derive a URL-safe slug from a card id (part after final `__`), de-duped against an existing index. */
function deriveSlug(card: WeeklyCard, explicit: string | undefined, existing: Set<string>): string {
  let base = explicit?.trim();
  if (!base) {
    const tail = card.id.split('__').pop() ?? '';
    base = tail || card.id;
  }
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

async function loadProposal(proposalsDir: string, week: string, cardId: string): Promise<WeeklyCard> {
  const proposalPath = join(proposalsDir, `${week}.json`);
  const file = JSON.parse(await readFile(proposalPath, 'utf-8')) as WeeklyProposalFile;
  const card = file.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`card ${cardId} not found in ${proposalPath}`);
  return card;
}

async function readSpecialIndex(path: string): Promise<SpecialIndexFile> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SpecialIndexFile;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { updated_at: new Date().toISOString(), entries: [] };
    }
    throw err;
  }
}

export async function publishCuration(opts: PublishOpts): Promise<string> {
  const type: PublishType = opts.type ?? 'weekly';
  const proposalsDir = opts.proposalsDir ?? join(process.cwd(), 'data', 'weekly-proposals');
  const card = await loadProposal(proposalsDir, opts.week, opts.cardId);
  const stripped = stripCardForPublish(card);
  const publishedAt = new Date().toISOString();

  if (type === 'weekly') {
    const outDir = opts.outDir ?? join(process.cwd(), 'public', 'data', 'weekly-curations');
    const published: WeeklyPublishedFile = {
      ...stripped,
      week: opts.week,
      published_at: publishedAt,
      published_by: opts.publishedBy,
    };
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, `${opts.week}.json`);
    await writeFile(outPath, JSON.stringify(published, null, 2));
    return outPath;
  }

  // type === 'special'
  const specialsDir =
    opts.specialsDir ?? join(process.cwd(), 'public', 'data', 'special-series');
  const specialIndexPath =
    opts.specialIndexPath ?? join(process.cwd(), 'public', 'data', 'special-index.json');

  const index = await readSpecialIndex(specialIndexPath);
  // For slug derivation, only treat existing slugs as collisions if the caller
  // did NOT pass an explicit --slug. When --slug is explicit, we honor it and
  // de-dup the index entry list instead (last write wins).
  const existingSlugs = new Set(
    opts.slug ? [] : index.entries.map((e) => e.slug),
  );
  const slug = deriveSlug(card, opts.slug, existingSlugs);

  await mkdir(specialsDir, { recursive: true });
  const specialPath = join(specialsDir, `${slug}.json`);
  const specialPayload = {
    ...stripped,
    slug,
    source_week: opts.week,
    published_at: publishedAt,
    published_by: opts.publishedBy,
  };
  await writeFile(specialPath, JSON.stringify(specialPayload, null, 2));

  const entry: SpecialIndexEntry = {
    slug,
    title_en: card.title_en,
    title_ko: card.title_ko,
    persona_id: card.persona_id,
    lens: card.lens,
    published_at: publishedAt,
    hero_image_url: heroImageUrl(card),
    source_week: opts.week,
  };
  // De-dup by slug; keep insertion order for existing entries (replace in place).
  const idx = index.entries.findIndex((e) => e.slug === slug);
  if (idx >= 0) index.entries[idx] = entry;
  else index.entries.push(entry);
  index.updated_at = publishedAt;
  await writeFile(specialIndexPath, JSON.stringify(index, null, 2));

  return specialPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv;
  const week = argv[argv.indexOf('--week') + 1];
  const cardId = argv[argv.indexOf('--card') + 1];
  const typeIdx = argv.indexOf('--type');
  const type = (typeIdx >= 0 ? argv[typeIdx + 1] : 'weekly') as PublishType;
  const slugIdx = argv.indexOf('--slug');
  const slug = slugIdx >= 0 ? argv[slugIdx + 1] : undefined;
  const publishedBy = process.env.USER ?? 'editor';
  if (!week || !cardId) {
    console.error(
      'Usage: tsx publish-curation.ts --week YYYY-Www --card <cardId> [--type weekly|special] [--slug <slug>]',
    );
    process.exit(1);
  }
  publishCuration({ week, cardId, publishedBy, type, slug })
    .then((p) => console.log(`Published to ${p}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
