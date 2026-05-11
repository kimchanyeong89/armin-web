# Weekly Curation Implementation Plan (Phase A)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Phase A pipeline that generates 5–15 weekly curation candidate cards each Sunday, lets the editor (project owner) pick one and publish it as a static JSON the ARMIN app fetches. No backend, no admin UI — just scripts + JSON + git.

**Architecture:** TypeScript scripts under `scripts/weekly/` produce `data/weekly-proposals/YYYY-Www.json`. A second script publishes the chosen card to `public/data/weekly-curations/YYYY-Www.json`. The ARMIN React app fetches the published file via `fetchCurrentCuration()`. Three trigger sources (anniversary, motif calendar, Korean trends) feed three personas × three lenses; weak cells drop.

**Tech Stack:** TypeScript, tsx (script runner), vitest (testing), Node.js fetch, existing SigLIP infra (text encoder TBD), Anthropic SDK for the writer pass.

---

## Context for the implementing engineer

You are dropped into ARMIN's repo with no prior context. Read this section before starting.

### What ARMIN is

A React + TypeScript + Vite art museum directory. ESM project (`"type": "module"`). Inline styles only — **no Tailwind**, no CSS modules. Data lives as static JSON in `public/data/` (~303 collection files) and `src/data/` (`exhibitions.js`, etc.).

### Existing data files you'll lean on

- `public/data/artists-dates.json` — keyed by artist name, contains `birthDate` / `deathDate` in `YYYY.MM.DD` format. **This is your anniversary source.**
- `public/data/<collection>-collection.json` — array of artworks per collection, each with at minimum `{id, title, artist, date, imageUrl, sourceUrl, category}` and often `thumbnail.lqip` + `original_imageUrl`.
- `siglip_processed_ids.txt` — list of artwork IDs that have SigLIP embeddings precomputed somewhere (Cloudflare? local file? Open question, see Task 6.)
- `workers/semantic-search/` — existing Cloudflare Worker for semantic search. Check its `schema.sql` to learn the embedding storage layout.

### Read this before writing anything

- `docs/plans/2026-05-11-weekly-curation-design.md` — the design this plan implements. Sections 4 (triggers), 5 (personas/lenses), 8 (schemas) define the contracts you must hit exactly.

### Critical conventions

- **Inline styles only.** Component code uses `const S = { container: { backgroundColor: '#111', ... } }` patterns. Don't introduce Tailwind or CSS modules.
- **Edit the main repo, not worktrees.** The user runs Vite dev server against this repo; HMR reflects edits live. Working in `.claude/worktrees/*` breaks the loop.
- **JSON field names are contracts.** Phase B (future D1 migration) depends on JSON field names matching future column names 1:1. Do not rename fields casually.

### Coding principles — apply throughout every task

- **DRY (Don't Repeat Yourself).** Single source of truth for any non-trivial fact. Examples that bite in this plan:
  - ISO-week math lives once in `scripts/weekly/motif-calendar.ts` (or extracted to `src/lib/iso-week.ts` if both `scripts/` and `src/` need it). Don't reimplement it in the orchestrator or the app.
  - Type definitions live once in `src/types/weekly.ts`. Both the generator scripts and the React app import from there — no parallel duplicate types.
  - Persona spec is the source of truth for taste, tone, *and* writer prompt context. The LLM writer reads the same JSON the scorer reads — no separate "prompt template" file with copy-pasted persona traits.
  - Collection index (Task 5) is the one place artwork lookup happens. Don't open `public/data/*.json` from anywhere else.
- **ETC (Easier To Change).** Write so the next change is small and local. Concrete habits:
  - Endpoints (SigLIP, FTS5, LLM model name) come from env vars with sensible defaults, not hardcoded strings scattered through files.
  - Tunables (`QUALITY_THRESHOLD = 0.35`, `TREND_MATCH_THRESHOLD = 0.28`, `CARD_WORK_COUNT = 10`) are named constants at the top of the orchestrator. One place to change a knob.
  - `fetchCurrentCuration()` (Task 17) is the only place the React app touches the curation data surface. Phase B is a one-line URL change inside that function — nothing else moves.
  - Lens builders share signature `(input, opts) => Promise<IndexedWork[]>`. Adding a fourth lens later doesn't require changing the orchestrator's contract.
  - Trigger fetchers all return a uniform `{term/name, source, traffic?}` shape so the orchestrator treats them interchangeably.
- **YAGNI.** Already in the design. Don't build for hypothetical future needs.
- **Surgical changes.** When modifying existing files (e.g., `WeeklyTab.tsx` in Task 18), touch only what the task requires. Don't refactor adjacent code, even if it looks tempting.

### Toolchain — verify or install in Task 0

- `tsx` (for running `.ts` scripts without compile step)
- `vitest` (for tests — co-located `*.test.ts` next to source)
- `@anthropic-ai/sdk` (for the writer pass)

If any are missing, install them in Task 0 before proceeding.

---

## Pre-flight checklist (Task 0)

Run these checks first. If any block, resolve before starting Task 1.

| Check | Pass criterion | If fail |
|---|---|---|
| `npx tsx --version` | prints a version | `npm i -D tsx` |
| `npx vitest --version` | prints a version | `npm i -D vitest` |
| `node -e "require('@anthropic-ai/sdk')"` | no error | `npm i @anthropic-ai/sdk` |
| `ls public/data/artists-dates.json` | file exists | abort — design assumption broken |
| `echo $ANTHROPIC_API_KEY` | non-empty | tell user; required for Task 14 onwards |
| SigLIP text encoder availability | see Task 6 | resolve as part of Task 6 |

---

## Task 0: Toolchain bootstrap

**Files:**
- Modify: `package.json` (add `weekly:generate`, `weekly:publish`, `test` scripts)
- Modify: `vitest.config.ts` (create if absent)
- Modify: `.gitignore` (ensure `data/weekly-proposals/` is **not** ignored; it's tracked)

**Step 1: Install missing deps**

```bash
npx tsx --version || npm i -D tsx
npx vitest --version || npm i -D vitest @vitest/ui
node -e "require('@anthropic-ai/sdk')" 2>/dev/null || npm i @anthropic-ai/sdk
```

Expected: all three resolve without further install.

**Step 2: Add npm scripts**

Edit `package.json`'s `scripts` block, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"weekly:generate": "tsx scripts/weekly/generate-proposals.ts",
"weekly:publish": "tsx scripts/weekly/publish-curation.ts"
```

**Step 3: Create `vitest.config.ts` if absent**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/weekly/**/*.test.ts', 'src/lib/weekly*.test.ts'],
    environment: 'node',
  },
});
```

**Step 4: Verify**

```bash
npm test
```

Expected: `No test files found, exiting with code 0` (or similar). Confirms vitest runs.

**Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(weekly): install tsx/vitest, add weekly npm scripts"
```

---

## Task 1: TypeScript types

**Files:**
- Create: `src/types/weekly.ts`
- Test: `src/types/weekly.test.ts` (type-level only; runs as `vitest` smoke test)

**Step 1: Write the failing test**

```ts
// src/types/weekly.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  WeeklyProposalFile,
  WeeklyCard,
  WeeklyWork,
  PersonaId,
  LensId,
  TriggerType,
} from './weekly';

describe('weekly types', () => {
  it('PersonaId is the three known personas', () => {
    expectTypeOf<PersonaId>().toEqualTypeOf<'yuna-choi' | 'marco-rinaldi' | 'anika-voss'>();
  });

  it('LensId is the three lenses', () => {
    expectTypeOf<LensId>().toEqualTypeOf<'biographical' | 'thematic' | 'dialogue'>();
  });

  it('a valid card compiles', () => {
    const card: WeeklyCard = {
      id: 'yuna-choi__biographical__test',
      persona_id: 'yuna-choi',
      lens: 'biographical',
      trigger: { type: 'anniversary', value: 'Test Artist · birth 2026-05-11', source: 'artists-dates.json' },
      score: 0.8,
      title_en: 'Title',
      title_ko: '제목',
      intro_en: 'Intro.',
      intro_ko: '인트로.',
      subtitle_chip: '',
      works: [],
      alternates: [],
    };
    expectTypeOf(card).toMatchTypeOf<WeeklyCard>();
  });
});
```

**Step 2: Run, expect failure**

```bash
npm test -- src/types/weekly.test.ts
```

Expected: FAIL — `Cannot find module './weekly'`.

**Step 3: Write the types**

```ts
// src/types/weekly.ts
export type PersonaId = 'yuna-choi' | 'marco-rinaldi' | 'anika-voss';

export type LensId = 'biographical' | 'thematic' | 'dialogue';

export type TriggerType = 'anniversary' | 'motif' | 'trend-google' | 'trend-naver';

export interface Trigger {
  type: TriggerType;
  value: string;            // human-readable label, e.g., "Vermeer · death 1675-12-15"
  source: string;           // file or URL identifying provenance
  similarity?: number;      // for trend triggers, the SigLIP cosine score
}

export interface WeeklyWork {
  position: number;                // 1-indexed
  role: 'hero' | 'standard';
  artwork_ref: string;             // `${collection}#${id}`
  artist: string;
  title: string;
  year: string;                    // raw `date` string from collection JSON
  image_url: string;
  source_collection: string;       // collection slug, e.g., 'aic-collection'
  source_url: string;
  lqip?: string;
  caption_en: string;
  caption_ko: string;
}

export interface WeeklyCard {
  id: string;                      // `${persona_id}__${lens}__${slug}`
  persona_id: PersonaId;
  lens: LensId;
  trigger: Trigger;
  score: number;                   // 0..1 quality score
  title_en: string;
  title_ko: string;
  intro_en: string;
  intro_ko: string;
  subtitle_chip: string;           // small ko chip under intro (e.g., "빛과 실내")
  works: WeeklyWork[];
  alternates: Array<Pick<WeeklyWork, 'position' | 'artwork_ref' | 'artist' | 'title' | 'year' | 'image_url' | 'source_collection' | 'source_url' | 'lqip'>>;
}

export interface WeeklyProposalFile {
  week: string;                    // `2026-W19`
  generated_at: string;            // ISO timestamp
  cards: WeeklyCard[];
}

export interface WeeklyPublishedFile extends Omit<WeeklyCard, 'alternates' | 'score'> {
  week: string;
  published_at: string;
  published_by: string;
}
```

**Step 4: Run, expect pass**

```bash
npm test -- src/types/weekly.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/types/weekly.ts src/types/weekly.test.ts
git commit -m "feat(weekly): add TS types matching design schema"
```

---

## Task 2: Persona JSON files + loader

**Files:**
- Create: `data/personas/yuna-choi.json`
- Create: `data/personas/marco-rinaldi.json`
- Create: `data/personas/anika-voss.json`
- Create: `scripts/weekly/personas.ts`
- Create: `scripts/weekly/personas.test.ts`

**Step 1: Write the failing test**

```ts
// scripts/weekly/personas.test.ts
import { describe, it, expect } from 'vitest';
import { loadPersonas, PERSONA_IDS } from './personas';

describe('personas', () => {
  it('loads all three personas', async () => {
    const personas = await loadPersonas();
    expect(Object.keys(personas).sort()).toEqual([...PERSONA_IDS].sort());
  });

  it('each persona has taste + tone + lensAffinity', async () => {
    const personas = await loadPersonas();
    for (const id of PERSONA_IDS) {
      const p = personas[id];
      expect(p.taste.eras.length).toBeGreaterThan(0);
      expect(Object.keys(p.taste.regions).length).toBeGreaterThan(0);
      expect(p.taste.themes.length).toBeGreaterThan(0);
      expect(p.lensAffinity.biographical).toBeGreaterThanOrEqual(0);
      expect(p.tone.sample.length).toBeGreaterThan(20);
    }
  });
});
```

**Step 2: Run, expect failure**

```bash
npm test -- scripts/weekly/personas.test.ts
```

Expected: FAIL — module not found.

**Step 3: Create persona JSONs**

`data/personas/yuna-choi.json`:

```json
{
  "id": "yuna-choi",
  "name": "Yuna Choi",
  "role": "Senior Editor, ARMIN",
  "avatar": "/personas/yuna-choi.jpg",
  "language_primary": "en",
  "language_gloss": "ko",
  "taste": {
    "eras": [
      {"range": [1860, 1920], "w": 1.0},
      {"range": [1990, 2025], "w": 0.8},
      {"range": [1600, 1700], "w": 0.7}
    ],
    "regions": {"KR": 1.0, "JP": 1.0, "NL": 0.9, "DK": 0.8, "CN": 0.7, "SE": 0.7},
    "media": ["paper", "watercolor", "oil_intimate", "bw_photo"],
    "themes": ["light", "interior", "stillness", "letter", "window", "garden", "sleep", "domestic"]
  },
  "lensAffinity": {"biographical": 1.0, "thematic": 1.0, "dialogue": 0.3},
  "tone": {
    "style": "poetic_minimal",
    "sentence": "short",
    "punctuation": ["em_dash", "ellipsis"],
    "sample": "There is a particular quality of light that painters have always chased — not the blazing noon, not the dramatic storm, but the in-between."
  }
}
```

`data/personas/marco-rinaldi.json`:

```json
{
  "id": "marco-rinaldi",
  "name": "Marco Rinaldi",
  "role": "Curator-at-Large, Classical Wing",
  "avatar": "/personas/marco-rinaldi.jpg",
  "language_primary": "en",
  "language_gloss": "ko",
  "taste": {
    "eras": [
      {"range": [1400, 1750], "w": 1.0},
      {"range": [1750, 1900], "w": 0.6}
    ],
    "regions": {"IT": 1.0, "BE": 0.9, "NL": 0.9, "ES": 0.9, "FR": 0.7, "DE": 0.5},
    "media": ["oil_panel", "fresco", "marble", "silverpoint", "tempera"],
    "themes": ["religious", "mythological", "history_painting", "patron", "drapery", "ruin", "saint"]
  },
  "lensAffinity": {"biographical": 1.0, "thematic": 0.6, "dialogue": 1.0},
  "tone": {
    "style": "scholarly_narrative",
    "sentence": "medium",
    "punctuation": ["semicolon", "em_dash"],
    "sample": "When Caravaggio fled Rome in May 1606, his palette did not lighten — it deepened, as if Naples itself had absorbed the guilt."
  }
}
```

`data/personas/anika-voss.json`:

```json
{
  "id": "anika-voss",
  "name": "Anika Voss",
  "role": "Independent Critic, Berlin",
  "avatar": "/personas/anika-voss.jpg",
  "language_primary": "en",
  "language_gloss": "ko",
  "taste": {
    "eras": [
      {"range": [1880, 1980], "w": 1.0},
      {"range": [1980, 2025], "w": 0.7}
    ],
    "regions": {"DE": 1.0, "US": 1.0, "FR": 0.9, "RU": 0.8, "JP": 0.7, "NL": 0.6},
    "media": ["oil_modernist", "photograph", "collage", "industrial_sculpture", "print"],
    "themes": ["grid", "rupture", "city", "industry", "machine", "abstraction", "constructivism"]
  },
  "lensAffinity": {"biographical": 0.3, "thematic": 1.0, "dialogue": 1.0},
  "tone": {
    "style": "theoretical_polemical",
    "sentence": "short",
    "punctuation": ["period", "colon"],
    "sample": "The grid did not arrive. It refused. Throughout the twentieth century painters returned to it not to escape representation, but to confront its impossibility."
  }
}
```

**Step 4: Write the loader**

```ts
// scripts/weekly/personas.ts
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
```

**Step 5: Run, expect pass**

```bash
npm test -- scripts/weekly/personas.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add data/personas scripts/weekly/personas.ts scripts/weekly/personas.test.ts
git commit -m "feat(weekly): add 3 persona JSONs and loader"
```

---

## Task 3: Motif calendar (seed with 12 monthly entries)

**Files:**
- Create: `data/motif-calendar.json`
- Create: `scripts/weekly/motif-calendar.ts`
- Create: `scripts/weekly/motif-calendar.test.ts`

**Step 1: Test**

```ts
// scripts/weekly/motif-calendar.test.ts
import { describe, it, expect } from 'vitest';
import { motifsForWeek, isoWeek } from './motif-calendar';

describe('motif calendar', () => {
  it('isoWeek formats correctly', () => {
    expect(isoWeek(new Date('2026-05-11T12:00:00Z'))).toBe('2026-W20');
    expect(isoWeek(new Date('2026-01-05T12:00:00Z'))).toBe('2026-W02');
  });

  it('returns motifs for any week (fallback to monthly bucket)', () => {
    const m = motifsForWeek('2026-W20');
    expect(m.length).toBeGreaterThanOrEqual(1);
    expect(typeof m[0].en).toBe('string');
    expect(typeof m[0].ko).toBe('string');
  });
});
```

**Step 2: Run, expect failure**

```bash
npm test -- scripts/weekly/motif-calendar.test.ts
```

**Step 3: Create motif calendar JSON (monthly seed)**

```json
{
  "default": [{"en": "light and shadow", "ko": "빛과 그림자"}],
  "monthly": {
    "01": [{"en": "winter silence", "ko": "겨울의 침묵"}, {"en": "snow", "ko": "눈"}],
    "02": [{"en": "early thaw", "ko": "초봄의 해빙"}, {"en": "interiority", "ko": "내면"}],
    "03": [{"en": "first bloom", "ko": "첫 개화"}, {"en": "renewal", "ko": "재생"}],
    "04": [{"en": "spring rain", "ko": "봄비"}, {"en": "garden", "ko": "정원"}],
    "05": [{"en": "light in quiet rooms", "ko": "조용한 빛"}, {"en": "windows", "ko": "창"}],
    "06": [{"en": "summer haze", "ko": "여름 안개"}, {"en": "sea", "ko": "바다"}],
    "07": [{"en": "noon heat", "ko": "한낮의 열기"}, {"en": "languor", "ko": "나른함"}],
    "08": [{"en": "harvest", "ko": "수확"}, {"en": "abundance", "ko": "풍요"}],
    "09": [{"en": "first cold", "ko": "첫 추위"}, {"en": "leaves turning", "ko": "단풍"}],
    "10": [{"en": "long evenings", "ko": "긴 저녁"}, {"en": "candle", "ko": "촛불"}],
    "11": [{"en": "portrait", "ko": "초상"}, {"en": "memory", "ko": "기억"}],
    "12": [{"en": "stillness before year end", "ko": "한 해의 끝"}, {"en": "snow at night", "ko": "밤눈"}]
  },
  "weekly": {}
}
```

Note the `weekly: {}` is empty — the engineer can fill specific ISO-weeks later to override the monthly default.

**Step 4: Implementation**

```ts
// scripts/weekly/motif-calendar.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Motif {
  en: string;
  ko: string;
}

interface MotifCalendar {
  default: Motif[];
  monthly: Record<string, Motif[]>;   // "01"..."12"
  weekly: Record<string, Motif[]>;    // "2026-W19"
}

let cache: MotifCalendar | null = null;

async function load(): Promise<MotifCalendar> {
  if (cache) return cache;
  const raw = await readFile(join(process.cwd(), 'data', 'motif-calendar.json'), 'utf-8');
  cache = JSON.parse(raw) as MotifCalendar;
  return cache;
}

export function isoWeek(d: Date): string {
  // ISO-8601 week: Thursday-anchored
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function weekRange(week: string): { start: Date; end: Date } {
  // Parse "2026-W20" → Monday..Sunday in UTC
  const [yStr, wStr] = week.split('-W');
  const year = parseInt(yStr, 10);
  const w = parseInt(wStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const start = new Date(week1Mon);
  start.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

export async function motifsForWeek(week: string): Promise<Motif[]> {
  const cal = await load();
  if (cal.weekly[week]) return cal.weekly[week];
  const { start } = weekRange(week);
  const mm = String(start.getUTCMonth() + 1).padStart(2, '0');
  return cal.monthly[mm] ?? cal.default;
}
```

**Step 5: Verify pass**

```bash
npm test -- scripts/weekly/motif-calendar.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add data/motif-calendar.json scripts/weekly/motif-calendar.ts scripts/weekly/motif-calendar.test.ts
git commit -m "feat(weekly): add motif calendar (monthly seed) + ISO week helpers"
```

---

## Task 4: Anniversary trigger

**Files:**
- Create: `scripts/weekly/triggers/anniversary.ts`
- Create: `scripts/weekly/triggers/anniversary.test.ts`

**Step 1: Test**

```ts
// scripts/weekly/triggers/anniversary.test.ts
import { describe, it, expect } from 'vitest';
import { anniversaryArtistsForWeek } from './anniversary';

describe('anniversary trigger', () => {
  it('finds Munch in his birthDate week (Dec 12, ISO W50 in 2025)', async () => {
    const result = await anniversaryArtistsForWeek('2025-W50');
    const names = result.map((r) => r.name);
    expect(names).toContain('Edvard Munch');
    const munch = result.find((r) => r.name === 'Edvard Munch')!;
    expect(munch.kind).toBe('birth');
  });

  it('returns empty when zero matches in tight week (use ±2 weeks fallback)', async () => {
    const result = await anniversaryArtistsForWeek('2026-W52', { expandWeeks: 0 });
    // Don't assert specific count; just that the call returns an array
    expect(Array.isArray(result)).toBe(true);
  });
});
```

**Step 2: Run, expect failure**

```bash
npm test -- scripts/weekly/triggers/anniversary.test.ts
```

**Step 3: Implementation**

```ts
// scripts/weekly/triggers/anniversary.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { weekRange } from '../motif-calendar';

interface ArtistsDatesEntry {
  name: string;
  birthDate?: string;       // "YYYY.MM.DD"
  deathDate?: string;
  wikiId?: string;
}

export interface AnniversaryMatch {
  name: string;
  kind: 'birth' | 'death';
  date: string;             // YYYY.MM.DD as stored
}

let cache: Record<string, ArtistsDatesEntry> | null = null;

async function loadArtists(): Promise<Record<string, ArtistsDatesEntry>> {
  if (cache) return cache;
  const raw = await readFile(join(process.cwd(), 'public', 'data', 'artists-dates.json'), 'utf-8');
  cache = JSON.parse(raw);
  return cache!;
}

function parseDot(d: string): { month: number; day: number } | null {
  const m = d.match(/^\d{4}\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
}

function inRange(md: { month: number; day: number }, start: Date, end: Date): boolean {
  // Check whether any day between start..end (inclusive, UTC) matches md.month/md.day, ignoring year.
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCMonth() + 1 === md.month && d.getUTCDate() === md.day) return true;
  }
  return false;
}

export async function anniversaryArtistsForWeek(
  week: string,
  opts: { expandWeeks?: number } = {},
): Promise<AnniversaryMatch[]> {
  const expand = opts.expandWeeks ?? 2;
  const artists = await loadArtists();
  const { start, end } = weekRange(week);
  // Apply expansion: shift start backward, end forward by expand weeks worth of days
  const wideStart = new Date(start); wideStart.setUTCDate(start.getUTCDate() - expand * 7);
  const wideEnd = new Date(end); wideEnd.setUTCDate(end.getUTCDate() + expand * 7);

  // First pass: tight window
  let matches = collectMatches(artists, start, end);
  if (matches.length > 0 || expand === 0) return matches;
  // Expanded
  return collectMatches(artists, wideStart, wideEnd);
}

function collectMatches(
  artists: Record<string, ArtistsDatesEntry>,
  start: Date,
  end: Date,
): AnniversaryMatch[] {
  const out: AnniversaryMatch[] = [];
  for (const entry of Object.values(artists)) {
    if (entry.birthDate) {
      const md = parseDot(entry.birthDate);
      if (md && inRange(md, start, end)) out.push({ name: entry.name, kind: 'birth', date: entry.birthDate });
    }
    if (entry.deathDate) {
      const md = parseDot(entry.deathDate);
      if (md && inRange(md, start, end)) out.push({ name: entry.name, kind: 'death', date: entry.deathDate });
    }
  }
  return out;
}
```

**Step 4: Verify pass**

```bash
npm test -- scripts/weekly/triggers/anniversary.test.ts
```

Expected: PASS. If Munch test fails, sanity-check the ISO week math against `2025-12-12` — it should be in W50.

**Step 5: Commit**

```bash
git add scripts/weekly/triggers/
git commit -m "feat(weekly): anniversary trigger from artists-dates.json"
```

---

## Task 5: Collection index — artwork lookup by artist name

**Files:**
- Create: `scripts/weekly/collection-index.ts`
- Create: `scripts/weekly/collection-index.test.ts`

**Why this exists:** the 303 collection JSONs are not indexed by artist. The anniversary trigger gives you `Edvard Munch` but you need `worksByArtist('Edvard Munch')` → flat list of artworks across all collections. Build this once, cache in-memory per script run.

**Step 1: Test**

```ts
// scripts/weekly/collection-index.test.ts
import { describe, it, expect } from 'vitest';
import { worksByArtist, buildIndex } from './collection-index';

describe('collection index', () => {
  it('builds without error', async () => {
    const idx = await buildIndex();
    expect(idx.artistCount).toBeGreaterThan(100);
    expect(idx.workCount).toBeGreaterThan(1000);
  });

  it('finds works by an artist that exists in many collections', async () => {
    const works = await worksByArtist('Claude Monet');
    expect(works.length).toBeGreaterThan(0);
    expect(works[0].artist.toLowerCase()).toContain('monet');
    expect(works[0].source_collection).toBeTruthy();
    expect(works[0].image_url).toBeTruthy();
  });
});
```

**Step 2: Run, expect failure**

**Step 3: Implementation**

```ts
// scripts/weekly/collection-index.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface IndexedWork {
  artwork_ref: string;          // `${collection}#${id}`
  source_collection: string;
  artist: string;
  title: string;
  year: string;
  image_url: string;
  source_url: string;
  lqip?: string;
  category?: string;
  medium?: string;
}

interface RawWork {
  id?: string | number;
  title?: string;
  artist?: string;
  date?: string;
  imageUrl?: string;
  sourceUrl?: string;
  category?: string;
  medium?: string;
  thumbnail?: { lqip?: string };
}

interface Index {
  byArtist: Map<string, IndexedWork[]>;
  all: IndexedWork[];
  artistCount: number;
  workCount: number;
}

let cache: Index | null = null;
const DATA_DIR = join(process.cwd(), 'public', 'data');

function normalizeArtist(raw: string): string {
  // Strip nationality/dates in parentheses e.g. "Walter Shirlaw (American, 1838–1909)"
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export async function buildIndex(): Promise<Index> {
  if (cache) return cache;
  const files = await readdir(DATA_DIR);
  const byArtist = new Map<string, IndexedWork[]>();
  const all: IndexedWork[] = [];
  for (const f of files) {
    if (!f.endsWith('-collection.json') && !f.endsWith('-paintings.json') && !f.endsWith('-prints.json')) continue;
    const collection = f.replace(/\.json$/, '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(DATA_DIR, f), 'utf-8'));
    } catch {
      continue;
    }
    const rows: RawWork[] = Array.isArray(parsed) ? parsed as RawWork[] : [];
    for (const r of rows) {
      if (!r.imageUrl || !r.artist) continue;
      const artist = normalizeArtist(r.artist);
      const work: IndexedWork = {
        artwork_ref: `${collection}#${r.id ?? ''}`,
        source_collection: collection,
        artist,
        title: r.title ?? '(untitled)',
        year: r.date ?? '',
        image_url: r.imageUrl,
        source_url: r.sourceUrl ?? '',
        lqip: r.thumbnail?.lqip,
        category: r.category,
        medium: r.medium,
      };
      all.push(work);
      const list = byArtist.get(artist) ?? [];
      list.push(work);
      byArtist.set(artist, list);
    }
  }
  cache = { byArtist, all, artistCount: byArtist.size, workCount: all.length };
  return cache;
}

export async function worksByArtist(name: string): Promise<IndexedWork[]> {
  const idx = await buildIndex();
  return idx.byArtist.get(normalizeArtist(name)) ?? [];
}
```

**Step 4: Verify pass**

```bash
npm test -- scripts/weekly/collection-index.test.ts
```

This will be slow (~5–15s) on first run because it reads 303 JSONs. Acceptable for a one-time index build per script invocation. If too slow during development, add a `.skip` for the larger test.

**Step 5: Commit**

```bash
git add scripts/weekly/collection-index.ts scripts/weekly/collection-index.test.ts
git commit -m "feat(weekly): collection index — works by artist across 303 collections"
```

---

## Task 6: Resolve the SigLIP text encoder open question

**Files:**
- Create: `scripts/weekly/embedding/text-encoder.ts`
- Create: `scripts/weekly/embedding/text-encoder.test.ts`

**Why this exists:** the design's open question is whether ARMIN's existing SigLIP infra exposes a text-to-vector endpoint. This task answers it and either uses it or stubs a fallback.

**Step 1: Discovery (15 minutes)**

Search the repo and report back:

```bash
grep -r "text.encode\|encode_text\|text_features\|textEncoder" workers/ apps/ scripts/ 2>/dev/null
grep -r "siglip" workers/ apps/ scripts/ 2>/dev/null | head -30
cat workers/semantic-search/schema.sql 2>/dev/null
ls workers/siglip-encoder-space/ 2>/dev/null
```

Three possible outcomes:

- **(a) Text encoder exposed**: there's an HTTP endpoint (likely in `workers/siglip-encoder-space/`) accepting text and returning a vector. Use it.
- **(b) Only image encoder exists**: build a thin wrapper. Easiest path is to call Anthropic / OpenAI text-embedding API and store vectors in a parallel index. **Defer this** — write a stub that returns deterministic vectors based on a hash of the input, and mark L3 trends as gated until real encoder is wired.
- **(c) Unclear**: ask the user.

Document the outcome at the top of `text-encoder.ts` in a comment.

**Step 2: Test (works for both real and stub)**

```ts
// scripts/weekly/embedding/text-encoder.test.ts
import { describe, it, expect } from 'vitest';
import { encodeText } from './text-encoder';

describe('text encoder', () => {
  it('returns a vector of the expected dimensionality', async () => {
    const v = await encodeText('light in quiet rooms');
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => typeof x === 'number')).toBe(true);
  });

  it('is deterministic for the same input', async () => {
    const a = await encodeText('test');
    const b = await encodeText('test');
    expect(a).toEqual(b);
  });
});
```

**Step 3: Implementation** (one of two, depending on Step 1 outcome)

**Variant (a) — real endpoint exists:**

```ts
// scripts/weekly/embedding/text-encoder.ts
const ENDPOINT = process.env.SIGLIP_TEXT_ENDPOINT ?? 'https://<replace-me>.workers.dev/text';

export async function encodeText(text: string): Promise<number[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`text encoder ${res.status}`);
  const data = await res.json() as { vector: number[] };
  return data.vector;
}
```

**Variant (b) — stub (until real encoder is wired):**

```ts
// scripts/weekly/embedding/text-encoder.ts
// STUB: real SigLIP text encoder not yet wired. Returns deterministic pseudo-vectors
// so the rest of the pipeline can be developed and unit-tested. L3 (trends) cards
// produced under this stub MUST be marked `score: 0` so they never pass the
// quality threshold in production. Replace with the variant (a) implementation
// once the encoder endpoint is available.
import { createHash } from 'node:crypto';

const DIM = 768;

export async function encodeText(text: string): Promise<number[]> {
  const h = createHash('sha256').update(text).digest();
  const v = new Array(DIM);
  for (let i = 0; i < DIM; i++) v[i] = (h[i % h.length] / 255) * 2 - 1;
  return v;
}
```

**Step 4: Verify pass**

```bash
npm test -- scripts/weekly/embedding/text-encoder.test.ts
```

**Step 5: Commit**

```bash
git add scripts/weekly/embedding/
git commit -m "feat(weekly): text encoder (variant a — real / variant b — stub)"
```

After committing, **report variant to the user** before proceeding. If variant (b), the user may want to wire the real encoder before continuing to Tasks 8–9.

---

## Task 7: Embedding match — find artworks similar to a query vector

**Files:**
- Create: `scripts/weekly/embedding/match.ts`
- Create: `scripts/weekly/embedding/match.test.ts`

This is also open: how artwork image embeddings are stored. Two paths:

- **(p1) Cloudflare Vectorize / D1 with vector columns** — query via a Worker endpoint that takes a query vector and returns top-K artwork IDs with similarities.
- **(p2) No live vector index yet** — fall back to FTS5 keyword search (`/search-text` endpoint already exists per CLAUDE.md memory) against the query text. Less semantic but functional.

Discovery: `grep -r "vectorize\|/search-text\|nearestNeighbor" workers/`.

**Step 1: Test**

```ts
// scripts/weekly/embedding/match.test.ts
import { describe, it, expect } from 'vitest';
import { matchByText } from './match';

describe('embedding match', () => {
  it('returns a ranked list of artwork refs with similarity', async () => {
    const results = await matchByText('light in quiet rooms', { topK: 10 });
    expect(results.length).toBeLessThanOrEqual(10);
    if (results.length > 0) {
      expect(results[0].artwork_ref).toBeTruthy();
      expect(results[0].similarity).toBeGreaterThanOrEqual(-1);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
    }
  });
});
```

**Step 2: Implementation (variant p2 — FTS5 fallback recommended for V1)**

```ts
// scripts/weekly/embedding/match.ts
const FTS_ENDPOINT = process.env.SEARCH_TEXT_ENDPOINT ?? 'https://<armin-search>/search-text';

export interface MatchResult {
  artwork_ref: string;
  similarity: number;       // for FTS, normalized rank score in [0,1]
}

export async function matchByText(
  query: string,
  opts: { topK?: number } = {},
): Promise<MatchResult[]> {
  const topK = opts.topK ?? 20;
  const res = await fetch(`${FTS_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${topK}`);
  if (!res.ok) return [];
  const data = await res.json() as { results: Array<{ artwork_ref: string; rank?: number }> };
  return (data.results ?? []).map((r, i) => ({
    artwork_ref: r.artwork_ref,
    similarity: r.rank ?? (1 - i / topK),
  }));
}
```

If the user prefers true semantic match and variant (a) text encoder is available, swap to a vector NN endpoint. Note in code which variant is active.

**Step 3: Verify pass + commit**

```bash
npm test -- scripts/weekly/embedding/match.test.ts
git add scripts/weekly/embedding/match.*
git commit -m "feat(weekly): text-to-artwork match (FTS5 fallback)"
```

---

## Task 8: Google Trends KR fetcher

**Files:**
- Create: `scripts/weekly/triggers/trends-google.ts`
- Create: `scripts/weekly/triggers/trends-google.test.ts`

Google Trends offers a daily-trends RSS at `https://trends.google.co.kr/trending/rss?geo=KR`. No auth required.

**Step 1: Test**

```ts
// scripts/weekly/triggers/trends-google.test.ts
import { describe, it, expect } from 'vitest';
import { fetchGoogleTrendsKR } from './trends-google';

describe('Google Trends KR fetcher', () => {
  it('returns a non-empty list with shape { term, traffic }', async () => {
    const terms = await fetchGoogleTrendsKR({ limit: 5 });
    expect(Array.isArray(terms)).toBe(true);
    if (terms.length > 0) {
      expect(typeof terms[0].term).toBe('string');
      expect(terms[0].term.length).toBeGreaterThan(0);
    }
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/triggers/trends-google.ts
import { XMLParser } from 'fast-xml-parser';  // if not installed: npm i fast-xml-parser

const RSS_URL = 'https://trends.google.co.kr/trending/rss?geo=KR';

export interface TrendTerm {
  term: string;
  traffic?: string;
}

export async function fetchGoogleTrendsKR(opts: { limit?: number } = {}): Promise<TrendTerm[]> {
  const limit = opts.limit ?? 30;
  let xml: string;
  try {
    const res = await fetch(RSS_URL, { headers: { 'User-Agent': 'armin-weekly/1.0' } });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const items: any[] = parsed?.rss?.channel?.item ?? [];
  return items.slice(0, limit).map((it) => ({
    term: String(it.title ?? '').trim(),
    traffic: it['ht:approx_traffic'] ?? undefined,
  })).filter((t) => t.term.length > 0);
}
```

Install dep first if missing: `npm i fast-xml-parser`.

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/triggers/trends-google.test.ts
git add scripts/weekly/triggers/trends-google.* package.json package-lock.json
git commit -m "feat(weekly): Google Trends KR fetcher (daily RSS)"
```

---

## Task 9: Naver DataLab fetcher

**Files:**
- Create: `scripts/weekly/triggers/trends-naver.ts`
- Create: `scripts/weekly/triggers/trends-naver.test.ts`

Naver DataLab requires API credentials. If env vars missing, the function returns `[]` cleanly so the pipeline can still produce cards without Naver.

Required env: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`. User obtains at https://developers.naver.com/.

**Step 1: Test**

```ts
// scripts/weekly/triggers/trends-naver.test.ts
import { describe, it, expect } from 'vitest';
import { fetchNaverDataLab } from './trends-naver';

describe('Naver DataLab fetcher', () => {
  it('returns empty array when credentials are missing without throwing', async () => {
    const prevId = process.env.NAVER_CLIENT_ID;
    const prevSecret = process.env.NAVER_CLIENT_SECRET;
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
    try {
      const result = await fetchNaverDataLab({ category: 'general' });
      expect(result).toEqual([]);
    } finally {
      if (prevId) process.env.NAVER_CLIENT_ID = prevId;
      if (prevSecret) process.env.NAVER_CLIENT_SECRET = prevSecret;
    }
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/triggers/trends-naver.ts
import type { TrendTerm } from './trends-google';

const DATALAB_URL = 'https://openapi.naver.com/v1/datalab/search';

export async function fetchNaverDataLab(
  opts: { category?: string; limit?: number } = {},
): Promise<TrendTerm[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];

  // DataLab requires a body specifying keyword groups; for "what's hot this week"
  // we use the trending categories endpoint instead:
  // (engineer: if Naver removes/changes this, swap to the actual current endpoint)
  // For now we treat this as a no-op stub that returns []. Replace with real call
  // once Naver app credentials and category mapping are confirmed.
  return [];
}

export type { TrendTerm } from './trends-google';
```

This task is intentionally a stub. The real Naver call is non-trivial (their DataLab API is built around comparing specified keyword groups, not surfacing new trends). Two options for V1:

- Stay as `return []` until the user confirms exact Naver source/scraping approach.
- Scrape `https://datalab.naver.com/keyword/realtimeList.naver` (was deprecated in 2021 — confirm current).

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/triggers/trends-naver.test.ts
git add scripts/weekly/triggers/trends-naver.*
git commit -m "feat(weekly): Naver DataLab fetcher stub (returns [] until source confirmed)"
```

After committing, **report to user**: Naver source is a stub; needs the user to confirm scraping vs API approach before real fetcher can be built.

---

## Task 10: Persona scorer

**Files:**
- Create: `scripts/weekly/selectors/persona-scorer.ts`
- Create: `scripts/weekly/selectors/persona-scorer.test.ts`

Scores how well a given `IndexedWork` matches a `Persona`'s taste profile. Used to rank candidate works inside a (persona × lens) cell.

**Step 1: Test**

```ts
// scripts/weekly/selectors/persona-scorer.test.ts
import { describe, it, expect } from 'vitest';
import { scoreWorkForPersona } from './persona-scorer';
import { loadPersonas } from '../personas';

describe('persona scorer', () => {
  it('scores a Vermeer interior higher for Yuna than for Anika', async () => {
    const personas = await loadPersonas();
    const vermeer = {
      artwork_ref: 'aic-collection#9',
      source_collection: 'aic-collection',
      artist: 'Johannes Vermeer',
      title: 'Woman Reading a Letter',
      year: '1663',
      image_url: 'x',
      source_url: 'x',
      medium: 'Oil on canvas',
      category: 'Painting',
    };
    const yuna = scoreWorkForPersona(vermeer, personas['yuna-choi']);
    const anika = scoreWorkForPersona(vermeer, personas['anika-voss']);
    expect(yuna).toBeGreaterThan(anika);
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/selectors/persona-scorer.ts
import type { Persona } from '../personas';
import type { IndexedWork } from '../collection-index';

function parseYear(raw: string): number | null {
  const m = raw.match(/-?\d{3,4}/);
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
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/selectors/persona-scorer.test.ts
git add scripts/weekly/selectors/persona-scorer.*
git commit -m "feat(weekly): persona scorer (era + theme V1; region/medium deferred)"
```

---

## Task 11: Biographical lens builder

**Files:**
- Create: `scripts/weekly/selectors/lens-biographical.ts`
- Create: `scripts/weekly/selectors/lens-biographical.test.ts`

Given an artist name, build a 10-work biographical curation with chronological spread.

**Step 1: Test**

```ts
// scripts/weekly/selectors/lens-biographical.test.ts
import { describe, it, expect } from 'vitest';
import { buildBiographicalLens } from './lens-biographical';

describe('biographical lens', () => {
  it('returns up to 10 works for a prolific artist, sorted by year', async () => {
    const works = await buildBiographicalLens('Claude Monet', { count: 10 });
    expect(works.length).toBeGreaterThan(0);
    expect(works.length).toBeLessThanOrEqual(10);
    const years = works.map((w) => parseInt(w.year.match(/-?\d{4}/)?.[0] ?? '0', 10));
    // Should be sorted ascending (or all zeros)
    const sorted = [...years].sort((a, b) => a - b);
    expect(years).toEqual(sorted);
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/selectors/lens-biographical.ts
import { worksByArtist, type IndexedWork } from '../collection-index';

function parseYear(raw: string): number {
  const m = raw.match(/-?\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

export async function buildBiographicalLens(
  artist: string,
  opts: { count?: number } = {},
): Promise<IndexedWork[]> {
  const count = opts.count ?? 10;
  const all = await worksByArtist(artist);
  if (all.length === 0) return [];
  // Sort by year, then bucket into early/mid/late and take a balanced sample.
  const sorted = [...all].sort((a, b) => parseYear(a.year) - parseYear(b.year));
  if (sorted.length <= count) return sorted;
  const bucketSize = Math.floor(sorted.length / count);
  const picked: IndexedWork[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(sorted[Math.min(i * bucketSize, sorted.length - 1)]);
  }
  return picked;
}
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/selectors/lens-biographical.test.ts
git add scripts/weekly/selectors/lens-biographical.*
git commit -m "feat(weekly): biographical lens — chronological 10-work spread"
```

---

## Task 12: Thematic lens builder

**Files:**
- Create: `scripts/weekly/selectors/lens-thematic.ts`
- Create: `scripts/weekly/selectors/lens-thematic.test.ts`

Theme keyword → embedding match → enforce artist diversity (max 3 works per artist).

**Step 1: Test**

```ts
// scripts/weekly/selectors/lens-thematic.test.ts
import { describe, it, expect } from 'vitest';
import { buildThematicLens } from './lens-thematic';

describe('thematic lens', () => {
  it('returns 10–12 works with artist diversity (≤3 per artist)', async () => {
    const works = await buildThematicLens('light in quiet rooms', { count: 10 });
    expect(works.length).toBeLessThanOrEqual(12);
    const counts = new Map<string, number>();
    for (const w of works) counts.set(w.artist, (counts.get(w.artist) ?? 0) + 1);
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(3);
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/selectors/lens-thematic.ts
import { matchByText } from '../embedding/match';
import { buildIndex, type IndexedWork } from '../collection-index';

export async function buildThematicLens(
  theme: string,
  opts: { count?: number; maxPerArtist?: number } = {},
): Promise<IndexedWork[]> {
  const count = opts.count ?? 10;
  const maxPerArtist = opts.maxPerArtist ?? 3;
  const idx = await buildIndex();
  const matches = await matchByText(theme, { topK: count * 4 });
  const byRef = new Map(idx.all.map((w) => [w.artwork_ref, w]));
  const picked: IndexedWork[] = [];
  const perArtist = new Map<string, number>();
  for (const m of matches) {
    const w = byRef.get(m.artwork_ref);
    if (!w) continue;
    const c = perArtist.get(w.artist) ?? 0;
    if (c >= maxPerArtist) continue;
    picked.push(w);
    perArtist.set(w.artist, c + 1);
    if (picked.length >= count) break;
  }
  return picked;
}
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/selectors/lens-thematic.test.ts
git add scripts/weekly/selectors/lens-thematic.*
git commit -m "feat(weekly): thematic lens — embedding match + artist diversity"
```

---

## Task 13: Dialogue lens builder

**Files:**
- Create: `scripts/weekly/selectors/lens-dialogue.ts`
- Create: `scripts/weekly/selectors/lens-dialogue.test.ts`

Two artists → 5+5 alternating works.

**Step 1: Test**

```ts
// scripts/weekly/selectors/lens-dialogue.test.ts
import { describe, it, expect } from 'vitest';
import { buildDialogueLens } from './lens-dialogue';

describe('dialogue lens', () => {
  it('returns alternating works from two artists', async () => {
    const works = await buildDialogueLens('Claude Monet', 'Pierre-Auguste Renoir', { perArtist: 5 });
    expect(works.length).toBeLessThanOrEqual(10);
    // Check alternation (not strict — last work may be unmatched)
    if (works.length >= 4) {
      expect(works[0].artist).not.toBe(works[1].artist);
    }
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/selectors/lens-dialogue.ts
import { worksByArtist, type IndexedWork } from '../collection-index';

export async function buildDialogueLens(
  artistA: string,
  artistB: string,
  opts: { perArtist?: number } = {},
): Promise<IndexedWork[]> {
  const n = opts.perArtist ?? 5;
  const a = (await worksByArtist(artistA)).slice(0, n);
  const b = (await worksByArtist(artistB)).slice(0, n);
  const out: IndexedWork[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/selectors/lens-dialogue.test.ts
git add scripts/weekly/selectors/lens-dialogue.*
git commit -m "feat(weekly): dialogue lens — 5+5 alternating from two artists"
```

---

## Task 14: LLM writer — title, intro, captions

**Files:**
- Create: `scripts/weekly/writer/llm-writer.ts`
- Create: `scripts/weekly/writer/llm-writer.test.ts`

Takes a persona, lens, trigger, and selected works → returns the bilingual text fields.

**Step 1: Test (mocked LLM)**

```ts
// scripts/weekly/writer/llm-writer.test.ts
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
```

**Step 2: Implementation**

```ts
// scripts/weekly/writer/llm-writer.ts
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
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/writer/llm-writer.test.ts
git add scripts/weekly/writer/
git commit -m "feat(weekly): LLM writer for bilingual title/intro/captions"
```

---

## Task 15: Generate-proposals orchestrator

**Files:**
- Create: `scripts/weekly/generate-proposals.ts`
- Create: `scripts/weekly/generate-proposals.test.ts`

Ties everything together. CLI: `npm run weekly:generate -- --week 2026-W20`.

**Step 1: Test (smoke — verifies file output shape)**

```ts
// scripts/weekly/generate-proposals.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateProposals } from './generate-proposals';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('./writer/llm-writer', () => ({
  writeCardCopy: async () => ({
    title_en: 'T', title_ko: 'ㅌ', intro_en: 'I', intro_ko: '이',
    subtitle_chip: 'ㅊ', captions: [],
  }),
}));

describe('generate-proposals orchestrator', () => {
  it('writes a valid proposal file with at least 1 card', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'weekly-'));
    try {
      const path = await generateProposals('2025-W50', { outDir });   // Munch week
      const file = JSON.parse(await readFile(path, 'utf-8'));
      expect(file.week).toBe('2025-W50');
      expect(Array.isArray(file.cards)).toBe(true);
      expect(file.cards.length).toBeGreaterThan(0);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/generate-proposals.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPersonas, PERSONA_IDS } from './personas';
import { motifsForWeek } from './motif-calendar';
import { anniversaryArtistsForWeek } from './triggers/anniversary';
import { fetchGoogleTrendsKR } from './triggers/trends-google';
import { fetchNaverDataLab } from './triggers/trends-naver';
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
const CARD_WORK_COUNT = 10;

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
  const outDir = opts.outDir ?? join(process.cwd(), 'data', 'weekly-proposals');
  await mkdir(outDir, { recursive: true });
  await buildIndex();   // warm up

  const personas = await loadPersonas();
  const [anniversaries, motifs, gTrends, nTrends] = await Promise.all([
    anniversaryArtistsForWeek(week),
    motifsForWeek(week),
    fetchGoogleTrendsKR({ limit: 10 }),
    fetchNaverDataLab(),
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
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/generate-proposals.test.ts
git add scripts/weekly/generate-proposals.*
git commit -m "feat(weekly): generate-proposals orchestrator (3x3 base + trend cards)"
```

---

## Task 16: Publish-curation CLI

**Files:**
- Create: `scripts/weekly/publish-curation.ts`
- Create: `scripts/weekly/publish-curation.test.ts`

CLI: `npm run weekly:publish -- --week 2026-W20 --card <cardId>`. Reads the proposal file, finds the card by ID, strips `alternates` + `score`, adds publish metadata, writes to `public/data/weekly-curations/`.

**Step 1: Test**

```ts
// scripts/weekly/publish-curation.test.ts
import { describe, it, expect } from 'vitest';
import { publishCuration } from './publish-curation';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('publish-curation', () => {
  it('copies the chosen card with publish metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-'));
    try {
      const propPath = join(dir, '2026-W20.json');
      const outDir = join(dir, 'out');
      await writeFile(propPath, JSON.stringify({
        week: '2026-W20',
        generated_at: '2026-05-10T00:00:00Z',
        cards: [
          { id: 'card-a', persona_id: 'yuna-choi', lens: 'biographical', trigger: { type: 'anniversary', value: 'x', source: 'y' }, score: 0.8, title_en: 'T', title_ko: 'ㅌ', intro_en: 'I', intro_ko: '이', subtitle_chip: '', works: [], alternates: [{ position: 1 }] },
          { id: 'card-b', persona_id: 'marco-rinaldi', lens: 'biographical', trigger: { type: 'anniversary', value: 'z', source: 'y' }, score: 0.7, title_en: '...', title_ko: '...', intro_en: '...', intro_ko: '...', subtitle_chip: '', works: [], alternates: [] },
        ],
      }));
      const outPath = await publishCuration({
        week: '2026-W20', cardId: 'card-a', publishedBy: 'tester',
        proposalsDir: dir, outDir,
      });
      const published = JSON.parse(await readFile(outPath, 'utf-8'));
      expect(published.week).toBe('2026-W20');
      expect(published.id).toBe('card-a');
      expect(published.published_by).toBe('tester');
      expect(published.alternates).toBeUndefined();
      expect(published.score).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2: Implementation**

```ts
// scripts/weekly/publish-curation.ts
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
```

**Step 3: Verify + commit**

```bash
npm test -- scripts/weekly/publish-curation.test.ts
git add scripts/weekly/publish-curation.*
git commit -m "feat(weekly): publish-curation CLI — proposal card → static JSON"
```

---

## Task 17: App-side `fetchCurrentCuration()`

**Files:**
- Create: `src/lib/weekly.ts`
- Create: `src/lib/weekly.test.ts`

The single fetch surface. Phase B will swap the URL inside this function — every component imports from here.

**Step 1: Test**

```ts
// src/lib/weekly.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchCurrentCuration } from './weekly';

describe('fetchCurrentCuration', () => {
  it('fetches the JSON for the current ISO week', async () => {
    const sample = { week: '2026-W20', id: 'x', title_en: 'T' };
    global.fetch = vi.fn(async (url: any) => ({
      ok: true,
      json: async () => sample,
    })) as any;
    const data = await fetchCurrentCuration();
    expect(data?.week).toBe('2026-W20');
    expect((global.fetch as any).mock.calls[0][0]).toContain('/data/weekly-curations/');
  });

  it('returns null when the file is missing (404)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 })) as any;
    expect(await fetchCurrentCuration()).toBeNull();
  });
});
```

**Step 2: Implementation**

```ts
// src/lib/weekly.ts
import type { WeeklyPublishedFile } from '../types/weekly';
import { isoWeek } from '../../scripts/weekly/motif-calendar';

export async function fetchCurrentCuration(
  date: Date = new Date(),
): Promise<WeeklyPublishedFile | null> {
  const week = isoWeek(date);
  const res = await fetch(`/data/weekly-curations/${week}.json`);
  if (!res.ok) return null;
  return await res.json() as WeeklyPublishedFile;
}
```

(Reaching across into `scripts/weekly/motif-calendar.ts` for `isoWeek` is OK — that function is pure. If you'd rather not have the app import from `scripts/`, move `isoWeek` to `src/lib/iso-week.ts` and import from there in both places.)

**Step 3: Verify + commit**

```bash
npm test -- src/lib/weekly.test.ts
git add src/lib/weekly.*
git commit -m "feat(weekly): app-side fetchCurrentCuration surface"
```

---

## Task 18: Wire `WeeklyTab` component (per Figma)

**Files:**
- Modify: existing `WeeklyTab` component (or create per Figma if not yet built)

This task depends on whether the Figma design has been turned into a React component. Two cases:

**Case A: component already exists** (e.g., `src/components/WeeklyTab.tsx`). Replace its hardcoded example data with `fetchCurrentCuration()`:

```tsx
// near top of component
import { fetchCurrentCuration } from '../lib/weekly';
import type { WeeklyPublishedFile } from '../types/weekly';

// inside component body
const [curation, setCuration] = useState<WeeklyPublishedFile | null>(null);
useEffect(() => {
  fetchCurrentCuration().then(setCuration);
}, []);

// render: replace hardcoded "Things That Glow in Quiet Rooms" etc.
// with curation?.title_en, curation?.intro_en, curation?.works.map(...)
// Show a loading skeleton while curation === null.
```

Maintain ARMIN's inline-style convention. No Tailwind.

**Case B: component doesn't exist yet**. Use Figma MCP to pull the design spec and translate. Run:

```
mcp__Figma__get_design_context with the Weekly tab nodeId
```

Then build a component that consumes `WeeklyPublishedFile` per the schema in `src/types/weekly.ts`.

**Step 1: Open the tab, manually verify**

After wiring, place a fixture file at `public/data/weekly-curations/<currentWeek>.json` with hand-edited content and confirm it renders.

**Step 2: Commit**

```bash
git add src/components/WeeklyTab.tsx <or equivalent>
git commit -m "feat(weekly): wire WeeklyTab to fetchCurrentCuration"
```

---

## Task 19: End-to-end dry run for current week

This task has no test file — it's an integration validation.

**Step 1: Run the generator**

```bash
npm run weekly:generate -- --week $(node -e "
const d = new Date();
const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const day = date.getUTCDay() || 7;
date.setUTCDate(date.getUTCDate() + 4 - day);
const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
console.log(\`\${date.getUTCFullYear()}-W\${String(weekNo).padStart(2,'0')}\`);
")
```

Expected: a `data/weekly-proposals/YYYY-Www.json` file appears with ≥3 cards.

**Step 2: Inspect**

Open the file. For each card, verify:

- `works[]` has 6–12 entries
- `image_url` is non-empty on every work
- `title_en` / `title_ko` / `intro_en` / `intro_ko` are filled
- `score` ≥ 0.35

If a card is broken (zero works, missing fields, ugly title), flag the persona/lens/trigger combo and tune in code.

**Step 3: Publish one**

Pick the best card's `id` and run:

```bash
npm run weekly:publish -- --week YYYY-Www --card <id>
```

**Step 4: Open the app**

```bash
npm run dev
```

Navigate to the Weekly tab. Expected: the picked card renders with hero work, title, intro, 10 works grid.

**Step 5: Commit the published curation (not the proposals)**

```bash
git add public/data/weekly-curations/YYYY-Www.json
git commit -m "chore(weekly): publish first dry-run curation for YYYY-Www"
```

Do **not** commit `data/weekly-proposals/*.json` — these are local working files, and over time may contain PII or unedited LLM drafts. Add to `.gitignore`:

```bash
echo "data/weekly-proposals/*.json" >> .gitignore
git add .gitignore
git commit -m "chore(weekly): gitignore proposal drafts"
```

---

## Phase A → Phase B notes (for after 4 weeks of operation)

Phase A is "good enough" once:

- Generator runs in <2 minutes
- ≥80% of weeks produce a card you actually want to publish
- Schema hasn't needed any field rename

Then Phase B becomes worthwhile. Migration tasks (not part of this plan):

1. Stand up D1 tables matching the JSON schemas — column names are already aligned.
2. Convert `generate-proposals.ts` body to a Cloudflare Worker cron.
3. Build `/admin/weekly` Vite route with card grid + inline editor + "publish" button.
4. Flip the URL in `fetchCurrentCuration()` from `/data/weekly-curations/...` to `/api/weekly-current`.

The single-line URL change at step 4 is what makes Phase A worth doing carefully — the app's contract doesn't move.

---

## Reference: file map after all 19 tasks

```
data/
  motif-calendar.json
  personas/
    yuna-choi.json
    marco-rinaldi.json
    anika-voss.json
  weekly-proposals/                              ← gitignored, local working files
    2026-W20.json
public/data/
  weekly-curations/                              ← committed, served by Vite
    2026-W20.json
scripts/weekly/
  personas.ts + .test.ts
  motif-calendar.ts + .test.ts
  collection-index.ts + .test.ts
  triggers/
    anniversary.ts + .test.ts
    trends-google.ts + .test.ts
    trends-naver.ts + .test.ts
  embedding/
    text-encoder.ts + .test.ts
    match.ts + .test.ts
  selectors/
    persona-scorer.ts + .test.ts
    lens-biographical.ts + .test.ts
    lens-thematic.ts + .test.ts
    lens-dialogue.ts + .test.ts
  writer/
    llm-writer.ts + .test.ts
  generate-proposals.ts + .test.ts
  publish-curation.ts + .test.ts
src/
  types/weekly.ts + .test.ts
  lib/weekly.ts + .test.ts
  components/WeeklyTab.tsx (modified)
```

19 source files + 17 test files + 5 data/JSON files, ~3,000–4,000 lines total.
