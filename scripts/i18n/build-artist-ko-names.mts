#!/usr/bin/env -S npx tsx
/**
 * build-artist-ko-names.mts — 한국어 이름이 없는 모든 작가의 이름을 한국어 표기로 옮긴다.
 * 위키데이터 이름표(artists.json)·소개글 이름(artist-names-bio.json)·이미 한글인 이름은 건너뛴다.
 *
 *   npx tsx scripts/i18n/build-artist-ko-names.mts            # 남은 이름을 옮기고 파일을 쓴다(이어하기 가능)
 *   npx tsx scripts/i18n/build-artist-ko-names.mts --limit 300 # 시험 삼아 300명만
 *   npx tsx scripts/i18n/build-artist-ko-names.mts --write-only # 옮긴 결과로 파일만 다시 쓴다
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
const PROGRESS = join(ROOT, '.cache/artist-ko-names-progress.json');
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
const LIMIT = Number(arg('--limit') || 0);
const WRITE_ONLY = process.argv.includes('--write-only');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/* ── who already has a Korean name (the same order the app looks in: artistLocalization.ts) ── */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const wikidata = new Set<string>();
for (const [name, entry] of Object.entries<any>(read(join(PUB, 'data/i18n/artists.json')))) if (entry?.name_ko) wikidata.add(norm(name));
const bioNames = read(join(PUB, 'data/i18n/artist-names-bio.json'));
const named = (value: string) => {
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

const PROGRESS_FILE = OUT || PROGRESS; // --out: a trial run that keeps its answers apart
const done: Record<string, string> = existsSync(PROGRESS_FILE) ? read(PROGRESS_FILE) : {};
/* names checked by hand (scripts/i18n/artist-ko-overrides.json) win over the model's and are never asked */
Object.assign(done, read(join(ROOT, 'scripts/i18n/artist-ko-overrides.json')));
const todo = [...artists.values()].filter((a) => !(a.key in done) && a.works >= MIN_WORKS).sort((a, b) => b.works - a.works);
console.log(`artists without a Korean name: ${artists.size}, already done: ${[...artists.keys()].filter((k) => k in done).length}, to do in this run: ${todo.length}`);

const PROMPT = `미술관 소장품의 작가 이름 칸에 적힌 값을 한국어 표기로 옮긴다. 입력은 [{"i":번호,"n":이름,"m":소장 미술관(출신 언어를 짐작하는 단서)}] 이고, 출력은 같은 번호의 [{"i":번호,"ko":"한국어 표기"}] JSON 배열이다. 입력의 모든 번호를 빠짐없이 돌려준다.

규칙:
- 사람 이름은 국립국어원 외래어 표기법에 따라 그 사람 모국어의 발음으로 적는다(프랑스인은 프랑스어, 독일인은 독일어, 네덜란드인은 네덜란드어 발음). 한국에서 널리 쓰이는 표기가 있으면 그 표기를 쓴다(예: Vincent van Gogh → 빈센트 반 고흐).
- 이름·성 순서는 입력 순서를 따른다. 단, 한국·중국·일본·베트남 이름은 성을 앞에 둔다. 중국 이름은 중국어 발음(Zhou Xiaoguang → 저우샤오광, 林玉山 → 린위산), 일본 이름은 일본어 발음(Takahashi Shōhachirō → 다카하시 쇼하치로), 한국 이름은 한국 이름 그대로(Jang Jin-yung → 장진영) 적는다.
- 이름에 붙은 국적·생몰년·직함·'mentioned on object' 같은 군더더기는 뺀다(Montague Flagg, American, 1842–1915 → 몬터규 플래그). 순서가 뒤섞인 값은 바로잡는다(dit) Jacques Villon (Gaston Duchamp → 자크 비용).
- 'attributed to', 'Zugeschrieben', 'after', 'workshop of', 'circle of', 'school of' 같은 말은 뜻을 살린다: 줄리오 캄피(추정), 렘브란트 공방, 루벤스 화파, 라파엘로 모작.
- 작가를 모르는 값(Unknown, Anonymous, anonyme, Anonym, Unbekannt, Unidentified, 佚名 …)은 '작가 미상'. 시대·지역이 붙어 있으면 괄호에 넣는다: 작가 미상(18세기 이탈리아).
- 사람이 아닌 값은 뜻으로 옮긴다: Ancient Egyptian → 고대 이집트, Deccani school → 데칸 화파, Indian → 인도. 회사·공방·단체 이름은 소리대로 적는다: Britton & Patterson → 브리튼 앤드 패터슨.
- 여러 사람이 적혀 있으면 쉼표로 나열한다.
- 이름 머리글자는 로마자 그대로, 성 앞에 둔다(Subramanyan K. G. → K. G. 수브라마니안, Creswell K.a.c. → K. A. C. 크레스웰, Smith W. Eugene → W. 유진 스미스). 그 밖에는 로마자·한자·가나를 남기지 않는다.
- Ltd, Co., Inc., Pty, GmbH 같은 회사 꼬리표는 뺀다. jun./Jr. 는 '주니어', sen./Sr. 는 '시니어'.
- 일본 이름이 '이름 성' 순서로 적혀 있어도(Kokuta Suda) 성을 앞에 둔다(스다 고쿠타).
- 이름이라고 볼 수 없는 값(문장 조각, 깨진 글자)은 ko 를 빈 문자열로 둔다. 설명을 덧붙이지 않는다.`;

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
        /* '' = "not a name": kept, so it is not asked again; anything else must read as Korean */
        if (Number.isInteger(row?.i) && row.i >= 0 && row.i < batch.length && (ko === '' || (/[가-힣]/.test(ko) && ko.length <= 80 && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(ko)))) out.set(row.i, ko);
      }
      madeBy[model] = (madeBy[model] || 0) + out.size;
      return out;
    } catch { await sleep(2000); }
  }
  return new Map();
}

if (!WRITE_ONLY) {
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

/* ── the app's files: artists with a page of their own in one file, the long tail in shards ── */
const hot: Record<string, string> = {};
const shards: Record<string, Record<string, string>> = {};
for (const a of artists.values()) {
  const ko = done[a.key];
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
console.log(`wrote ${Object.keys(hot).length} names (10+ works) and ${Object.values(shards).reduce((n, s) => n + Object.keys(s).length, 0)} in shards`);
