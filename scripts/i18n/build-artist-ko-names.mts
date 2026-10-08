#!/usr/bin/env -S npx tsx
/**
 * build-artist-ko-names.mts — 한국어 이름이 없는 모든 작가의 이름을 한국어 표기로 옮긴다.
 * 위키데이터 이름표(artists.json)·소개글 이름(artist-names-bio.json)·이미 한글인 이름은 건너뛴다.
 *
 *   npx tsx scripts/i18n/build-artist-ko-names.mts            # 남은 이름을 옮기고 파일을 쓴다(이어하기 가능)
 *   npx tsx scripts/i18n/build-artist-ko-names.mts --limit 300 # 시험 삼아 300명만
 *   npx tsx scripts/i18n/build-artist-ko-names.mts --write-only # 옮긴 결과로 파일만 다시 쓴다
 *   … --export todo.json   남은 이름을 내보낸다(다른 도구에 맡길 때) / --import answers.json  {키: 한국어} 답을 받아 파일을 쓴다
 * 옮기는 규칙은 scripts/i18n/artist-ko-names-rules.md 한 곳에 있다(어느 도구에 맡기든 같은 글을 준다).
 *
 * 결과(둘 다 artistFileKey 키, 표시 전용 — 한국어 검색은 위키데이터 이름표만 본다):
 * 손으로 확인한 이름은 scripts/i18n/artist-ko-overrides.json 에 적는다(모델 답보다 우선).
 *   public/data/i18n/artist-names-ko.json          작품 10점 이상 작가(앱이 한 번에 읽음)
 *   public/data/i18n/artist-names-ko/<shard>.json  나머지(artistShardOf, 필요할 때 읽음)
 * 진행 기록: .cache/artist-ko-names-progress.json. .env 의 VITE_GEMINI_API_KEY 가 필요하다.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIST_OWN_FILE_MIN, KNOWN_ARTIST_FILE_KEYS, artistFileKey, artistFileName, artistShardOf, prettifyArtistName, stripArtistNoise } from '../../src/utils/artistKey.js';
import { getCanonicalName } from '../../src/utils/canonicalArtist';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const PUB = join(ROOT, 'public');
const PROGRESS = join(ROOT, `.cache/artist-${process.argv.includes('--en') ? 'en' : 'ko'}-names-progress.json`);
const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
/* --model/--batch/--parallel: the key's free tier allows few requests a day per model, so a run names
   the model whose quota it spends and packs more names into each request */
const MODELS = (arg('--model') || 'gemini-3.6-flash').split(','); // tried in this order; one whose day is spent is dropped
const spent = new Set<string>();
const madeBy: Record<string, number> = {};
const BATCH = Number(arg('--batch') || 60);
const PARALLEL = Number(arg('--parallel') || 8);
const MIN_WORKS = Number(arg('--min-works') || 0);
const OUT = arg('--out');
/* --en: the other direction. Artists whose names are written in Hangul, Han or kana get a Latin
   spelling for the English screens (public/data/i18n/artist-names-en.json, one file: about 4,000). */
const EN = process.argv.includes('--en');
const CJK = /[가-힣\u3040-\u30ff\u4e00-\u9fff\u0400-\u04ff\u0370-\u03ff\u0590-\u06ff\u0e00-\u0e7f]/; // Hangul, kana, Han, and Cyrillic, Greek, Hebrew, Arabic, Thai
const EXPORT = arg('--export'); // write the names still to do ([{key,n,m,works}]) for another engine, and stop
const IMPORT = arg('--import'); // take another engine's answers ({key: Korean}) into the progress file
const LIMIT = Number(arg('--limit') || 0);
const WRITE_ONLY = process.argv.includes('--write-only');
/** an answer is kept when it reads as Korean ('' = "not a name", kept so it is not asked again) */
const acceptable = (ko: string) => ko === '' || (EN ? /[A-Za-z]/.test(ko) && ko.length <= 90 && !CJK.test(ko) : /[가-힣]/.test(ko) && ko.length <= 80 && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(ko));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/* ── who already has a Korean name (the same order the app looks in: artistLocalization.ts) ── */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const wikidata = new Set<string>();
for (const [name, entry] of Object.entries<any>(read(join(PUB, 'data/i18n/artists.json')))) if (entry?.name_ko) wikidata.add(norm(name));
const bioNames = read(join(PUB, 'data/i18n/artist-names-bio.json'));
const named = (value: string) => {
  if (EN) return !CJK.test(value); // only names in Hangul, Han or kana want a Latin spelling
  if (/[가-힣]/.test(value) || wikidata.has(norm(value))) return true;
  const canon = getCanonicalName(value);
  if (canon && wikidata.has(norm(canon))) return true;
  if (value.includes(',') && !value.includes('(')) {
    const parts = value.split(',');
    if (parts.length === 2 && wikidata.has(norm(`${parts[1]} ${parts[0]}`))) return true;
  }
  return Boolean(bioNames[artistFileKey(value)]);
};

/* ── every artist the app shows: file key → the spelling with the most works, a museum as a hint ── */
const MASTER_KEYS = new Set<string>(Object.values(KNOWN_ARTIST_FILE_KEYS));
interface Artist { key: string; name: string; works: number; museum: string }
const artists = new Map<string, Artist>();
const add = (raw: string, works: number, museum: () => string) => {
  if (!raw || named(raw)) return;
  const key = artistFileKey(raw);
  /* a master's short key ("raphael", "duchamp") also catches other people (Raphael Soyer, Jacques Villon
     born Gaston Duchamp): one Korean name for the key would mislabel someone, so these stay as they are */
  if (!key || MASTER_KEYS.has(key)) return;
  const had = artists.get(key);
  if (had) { had.works += works; return; }
  artists.set(key, { key, name: prettifyArtistName(stripArtistNoise(raw)).slice(0, 120), works, museum: museum() });
};
for (const e of read(join(PUB, 'artists/_index.json'))) {
  add(e.a, e.c, () => { try { return String(read(join(PUB, 'artists', `${artistFileName(e.k)}.json`))[0]?.m || ''); } catch { return ''; } });
}
for (const f of readdirSync(join(PUB, 'artists/shards'))) {
  for (const works of Object.values<any[]>(read(join(PUB, 'artists/shards', f)))) add(works[0]?.a, works.length, () => String(works[0]?.m || ''));
}

/* collections whose artists the search index never saw: it reads `artist`, while some museums keep
   them elsewhere (MNK Kraków: authors: [{ id, name }]) and index every work as "Unknown". The app
   reads those fields itself (InteractiveGlobeRealModal.resolveArtist), so the names do reach the screen. */
const fromIndex = new Set(artists.keys());
const text = (v: any): string => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? text(v.map((x) => (x && typeof x === 'object' ? x.name : x)).find((x) => typeof x === 'string' && x.trim())) : v && typeof v === 'object' ? text(v.name) : '');
const artistOf = (w: any): string => [w?.artist, w?.maker, w?.attribution, w?.creator, w?.author, w?.a, w?.authors, w?.autor, w?.raw?.authors, w?.raw?.artist, w?.raw?.author]
  .map(text).find((t) => t && !/^(unknown|unknown artist|n\/a|-+)$/i.test(t)) || '';
for (const f of readdirSync(join(PUB, 'data')).filter((f) => f.endsWith('.json') && !/^(search-|video-|artist|museum)|manifest|prefix|removed|backup/.test(f))) {
  let rows: any;
  try { rows = read(join(PUB, 'data', f)); } catch { continue; }
  const list: any[] | null = Array.isArray(rows) ? rows : Array.isArray(rows?.artworks) ? rows.artworks : Array.isArray(rows?.items) ? rows.items : null;
  if (!list) continue;
  const count = new Map<string, number>();
  for (const w of list) { const name = artistOf(w); if (name) count.set(name, (count.get(name) || 0) + 1); }
  const museum = String(list[0]?.museum || list[0]?.m || list[0]?.museumName || f.replace(/(-collection)?\.json$/, ''));
  for (const [name, n] of count) if (!fromIndex.has(artistFileKey(name))) add(name, n, () => museum);
}

const PROGRESS_FILE = OUT || PROGRESS; // --out: a trial run that keeps its answers apart
const done: Record<string, string> = existsSync(PROGRESS_FILE) ? read(PROGRESS_FILE) : {};
/* names checked by hand (scripts/i18n/artist-ko-overrides.json) win over the model's and are never asked */
if (!EN) Object.assign(done, read(join(ROOT, 'scripts/i18n/artist-ko-overrides.json')));
const todo = [...artists.values()].filter((a) => !(a.key in done) && a.works >= MIN_WORKS).sort((a, b) => b.works - a.works);
console.log(`artists without a Korean name: ${artists.size}, already done: ${[...artists.keys()].filter((k) => k in done).length}, to do in this run: ${todo.length}`);

const RULES = readFileSync(join(ROOT, 'scripts/i18n/artist-ko-names-rules.md'), 'utf8').trim();
const PROMPT = `미술관 소장품의 작가 이름 칸에 적힌 값을 한국어 표기로 옮긴다. 입력은 [{"i":번호,"n":이름,"m":소장 미술관(출신 언어를 짐작하는 단서)}] 이고, 출력은 같은 번호의 [{"i":번호,"ko":"한국어 표기"}] JSON 배열이다. 입력의 모든 번호를 빠짐없이 돌려준다.

규칙:
${RULES}`;

const KEY = (readFileSync(join(ROOT, '.env'), 'utf8').match(/^VITE_GEMINI_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');

/** one batch → { index: Korean }, only answers that are written in Hangul */
async function transliterate(batch: Artist[]): Promise<Map<number, string>> {
  const items = batch.map((a, i) => ({ i, n: a.name, m: a.museum }));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const open = MODELS.filter((m) => !spent.has(m));
    if (!open.length) return new Map();
    /* 503 'high demand' comes in waves, model by model: the next attempt asks the next model */
    const model = open[attempt % open.length];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
        method: 'POST',
        signal: AbortSignal.timeout(120000), // a busy model can hold a request open for minutes: give up and ask the next
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${PROMPT}\n\n${JSON.stringify(items)}` }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      });
      if (res.status === 429 && /PerDay/.test(await res.clone().text())) {
        if (!spent.has(model)) console.warn(`\n  ${model}: today's quota is spent`);
        spent.add(model);
        continue;
      }
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * (attempt + 1) + Math.random() * 3000); continue; }
      if (!res.ok) { console.warn(`\n  ${model} ${res.status}: ${(await res.text()).slice(0, 160)}`); spent.add(model); continue; }
      const rows = JSON.parse((await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
      const out = new Map<number, string>();
      for (const row of Array.isArray(rows) ? rows : []) {
        const ko = String(row?.ko ?? '').replace(/\s+/g, ' ').trim();
        if (Number.isInteger(row?.i) && row.i >= 0 && row.i < batch.length && acceptable(ko)) out.set(row.i, ko);
      }
      madeBy[model] = (madeBy[model] || 0) + out.size;
      return out;
    } catch { await sleep(2000); }
  }
  return new Map();
}

if (EXPORT) {
  writeFileSync(EXPORT, JSON.stringify(todo.map((a) => ({ key: a.key, n: a.name, m: a.museum, works: a.works }))));
  console.log(`exported ${todo.length} names to ${EXPORT}`);
  process.exit(0);
}
if (IMPORT) {
  let taken = 0, refused = 0;
  for (const [key, value] of Object.entries<any>(read(IMPORT))) {
    const ko = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (artists.has(key) && acceptable(ko)) { done[key] = ko; taken++; } else refused++;
  }
  writeFileSync(PROGRESS_FILE, JSON.stringify(done));
  console.log(`imported ${taken} names, refused ${refused}`);
}
if (!WRITE_ONLY && !IMPORT) {
  if (!KEY) throw new Error('VITE_GEMINI_API_KEY is missing from .env');
  const queue = LIMIT ? todo.slice(0, LIMIT) : todo;
  const batches: Artist[][] = [];
  for (let i = 0; i < queue.length; i += BATCH) batches.push(queue.slice(i, i + BATCH));
  let next = 0, got = 0;
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < batches.length) {
      const n = next++;
      const answers = await transliterate(batches[n]);
      for (const [i, ko] of answers) { done[batches[n][i].key] = ko; got++; }
      if (n % 2 === 0) { writeFileSync(PROGRESS_FILE, JSON.stringify(done)); process.stdout.write(`\r  ${n + 1}/${batches.length} batches, ${got} names ${JSON.stringify(madeBy)}`); }
    }
  }));
  writeFileSync(PROGRESS_FILE, JSON.stringify(done));
  console.log(`\n  got ${got} of ${queue.length}`, madeBy);
}

if (OUT) process.exit(0);

if (EN) {
  const names: Record<string, string> = {};
  for (const a of artists.values()) if (done[a.key]) names[a.key] = done[a.key];
  writeFileSync(join(PUB, 'data/i18n/artist-names-en.json'), JSON.stringify(names));
  console.log(`wrote ${Object.keys(names).length} Latin spellings`);
  process.exit(0);
}

if (!EN) Object.assign(done, read(join(ROOT, 'scripts/i18n/artist-ko-overrides.json')));

/* ── the app's files: artists with a page of their own in one file, the long tail in shards ── */
const NOT_A_NAME = '-';
const hot: Record<string, string> = {};
const shards: Record<string, Record<string, string>> = {};
for (const a of artists.values()) {
  /* '' = "this is no maker" (a title, a date, a stock number, a link left in the artist field): written
     as '-' so the app can show an unknown maker in its place instead of the stray text */
  const ko = done[a.key] === '' ? NOT_A_NAME : done[a.key];
  if (!ko) continue;
  if (a.works >= ARTIST_OWN_FILE_MIN) hot[a.key] = ko;
  else (shards[artistShardOf(a.key)] ??= {})[a.key] = ko;
}
const DIR = join(PUB, 'data/i18n/artist-names-ko');
mkdirSync(DIR, { recursive: true });
writeFileSync(join(PUB, 'data/i18n/artist-names-ko.json'), JSON.stringify(hot));
/* every shard is written, empty ones too: a missing file would come back as the app's HTML */
for (let i = 0; i < 512; i += 1) {
  const id = i.toString(16).padStart(3, '0');
  writeFileSync(join(DIR, `${id}.json`), JSON.stringify(shards[id] || {}));
}
/* the way back, for search: a Korean spelling typed into the search box finds the name the works are
   filed under. 512 files by the first two syllables of the name's first and last words (the given name
   and the surname: what people type) -> [[Korean, key, works]]. Korean names start with few syllables,
   so one syllable made files of over a megabyte.
   (artistLocalization.resolveArtistAlias reads the one file a query needs.) */
const FIND = join(PUB, 'data/i18n/artist-names-ko-find');
mkdirSync(FIND, { recursive: true });
const find: Record<string, [string, string, number][]> = {};
const findShard = (word: string) => { let h = 0x811c9dc5; for (const ch of [...word].slice(0, 2)) { h ^= ch.codePointAt(0) || 0; h = Math.imul(h, 0x01000193) >>> 0; } return (h % 512).toString(16).padStart(3, '0'); };
for (const a of artists.values()) {
  const ko = done[a.key];
  if (!ko || ko === '작가 미상') continue;
  const words = ko.split(/[\s,()·]+/).filter((w) => /^[가-힣]/.test(w));
  const firsts = new Set([words[0], words[words.length - 1]].filter(Boolean).map(findShard));
  for (const id of firsts) (find[id] ??= []).push([ko, a.key, a.works]);
}
for (let i = 0; i < 512; i += 1) {
  const id = i.toString(16).padStart(3, '0');
  writeFileSync(join(FIND, `${id}.json`), JSON.stringify(find[id] || []));
}
console.log(`wrote ${Object.keys(hot).length} names (10+ works) and ${Object.values(shards).reduce((n, s) => n + Object.keys(s).length, 0)} in shards`);
