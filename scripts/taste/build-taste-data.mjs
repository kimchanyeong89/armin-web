#!/usr/bin/env node
/**
 * build-taste-data.mjs — 개인 취향 점수(전시별 취향 일치 %, 취향 작품이 몰린 상설 미술관)에 쓰는
 * 데이터를 만들어 semantic-search 워커에 올린다. 점수 공식은 workers/semantic-search/src/taste.ts 한 곳에 있다.
 *
 * 사용법:
 *   node scripts/taste/build-taste-data.mjs             # 전시만 (npm run exhibitions:sync 뒤에 자동으로 이어진다)
 *   node scripts/taste/build-taste-data.mjs --museums   # 상설 미술관 요약까지 (소장품·임베딩이 늘었을 때)
 *   node scripts/taste/build-taste-data.mjs --refresh   # 캐시한 이웃 작품과 '벡터 없음' 기록을 버리고 다시 찾는다
 *   node scripts/taste/build-taste-data.mjs --dry-run   # 만들기만 하고 올리지 않는다
 *
 * 전시: 제목과 소개글로 Jina 텍스트→이미지 검색을 해 가까운 작품 30점을 찾고, 그중 SigLIP 벡터가 있는
 *   앞쪽 12점을 그 전시의 대표로 둔다. 사용자의 좋아요도 SigLIP 이미지 벡터라 이미지끼리 비교하게 된다.
 *   SigLIP 의 텍스트↔이미지 유사도는 0.2 안팎이라, 소개글 벡터를 바로 비교하면 취향 차이가 묻힌다.
 * 상설 미술관: 소장품 벡터를 미술관마다 최대 400점 뽑아 대표 벡터 16개로 줄인다. 로컬 임베딩 파일에 없는
 *   작품은 워커(Vectorize)에서 받는다. 사용자별 상위 5% 문턱을 잡는 전체 표본과 전시 기준점에 쓰는
 *   배경 군집도 이때 만든다.
 *
 * 증분: 소개글이 그대로인 전시는 지난번 이웃을 다시 쓰고, 받은 벡터는 scripts/taste/.cache 에 둔다.
 * 만든 데이터가 지난번에 올린 것과 같으면 올리지 않는다.
 *
 * 인증: workers/semantic-search/.env 의 ADMIN_TOKEN (또는 환경 변수 TASTE_ADMIN_TOKEN).
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DIM,
  MUSEUM_MIN_ARTWORKS,
  exhibitionRaw,
  kMeans,
  normalize,
  openExhibitions,
  packInt8,
  summarizeCollection,
  unpackInt8,
} from '../../workers/semantic-search/src/taste.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const CACHE = join(ROOT, 'scripts/taste/.cache');
const WORKER = process.env.TASTE_WORKER_URL || 'https://armin-semantic-search.armin-art.workers.dev';
const VECTOR_FILES = ['siglip_embeddings.jsonl', 'siglip_targeted_embeddings.jsonl', 'siglip_missing_permanent_embeddings.jsonl']
  .map((f) => join(ROOT, 'embedding_results', f));

const NEIGHBORS_ASKED = 30; // Jina 검색으로 받는 이웃 작품 수
const NEIGHBORS_KEPT = 12; // 그중 벡터가 있는 앞쪽 몇 점을 전시의 대표로 두나
const NEIGHBORS_MIN = 4; // 이보다 적으면 점수를 매기지 않는다
const MUSEUM_SAMPLE = 400; // 미술관마다 요약에 쓰는 소장품 수
const CORPUS_SAMPLE = 2000; // 사용자별 상위 5% 문턱을 잡는 전체 표본
const BACKGROUND_POOL = 24000; // 배경 군집을 만드는 전체 표본
const BACKGROUND_K = 48;
const FETCH_CHUNK = 50; // /vectors-by-ids 한 번에 묻는 수 — 벡터 JSON 이 크면 워커 CPU 한도에 걸린다

const argv = process.argv.slice(2);
const MUSEUMS = argv.includes('--museums');
const REFRESH = argv.includes('--refresh');
const DRY_RUN = argv.includes('--dry-run');

const started = Date.now();
const log = (...args) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...args);
const sha1 = (text) => createHash('sha1').update(text).digest('hex');
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value));

function adminToken() {
  if (process.env.TASTE_ADMIN_TOKEN) return process.env.TASTE_ADMIN_TOKEN;
  const file = join(ROOT, 'workers/semantic-search/.env');
  const line = existsSync(file) && readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_TOKEN='));
  return line ? line.slice('ADMIN_TOKEN='.length).trim() : '';
}
const TOKEN = adminToken();

/** 시드가 같으면 같은 난수 — 같은 데이터로 다시 만들면 같은 표본이 뽑힌다. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function callWorker(path, body, { admin = false, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) headers['x-admin-token'] = TOKEN;
  const res = await fetch(`${WORKER}${path}`, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${data.error || ''}`.trim());
  return data;
}

/** 워커가 몇십 초씩 503 을 내는 구간이 있어, 간격을 두 배씩 늘려 가며 다섯 번까지 묻는다(최대 30초 대기). */
async function withRetries(fn, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

async function mapPool(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function loadExhibitionsData() {
  const { exhibitions } = await import(`${pathToFileURL(join(ROOT, 'src/data/exhibitions.js')).href}?t=${Date.now()}`);
  return exhibitions;
}

// ── 벡터 캐시 ───────────────────────────────────────────────────

/** 받은 벡터(vector-ids.json + vectors.f32)와, Vectorize 에도 없던 작품(absent.json). */
function loadVectorCache() {
  const ids = readJson(join(CACHE, 'vector-ids.json'), []);
  const vectors = new Map();
  if (ids.length) {
    const buf = readFileSync(join(CACHE, 'vectors.f32'));
    const flat = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    ids.forEach((id, i) => vectors.set(id, flat.slice(i * DIM, (i + 1) * DIM)));
  }
  return { vectors, absent: new Set(REFRESH ? [] : readJson(join(CACHE, 'absent.json'), [])) };
}

function saveVectorCache({ vectors, absent }) {
  const ids = [...vectors.keys()];
  const flat = new Float32Array(ids.length * DIM);
  ids.forEach((id, i) => flat.set(vectors.get(id), i * DIM));
  writeJson(join(CACHE, 'vector-ids.json'), ids);
  writeFileSync(join(CACHE, 'vectors.f32'), Buffer.from(flat.buffer));
  writeJson(join(CACHE, 'absent.json'), [...absent]);
}

/**
 * 워커에서 작품 벡터를 받아 onVector(id, vector) 로 넘긴다. Vectorize 에도 없는 작품은 absent 에 적어
 * 다음부터 묻지 않는다. 조회가 일부 실패한 묶음은 없다고 적지 않는다.
 */
async function fetchVectors(ids, absent, onVector) {
  let got = 0;
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const { vectors, failedCalls } = await withRetries(() => callWorker('/vectors-by-ids', { ids: chunk }, { admin: true }));
    for (const id of chunk) {
      if (vectors[id]) {
        onVector(id, normalize(Float32Array.from(vectors[id])));
        got++;
      } else if (!failedCalls) {
        absent.add(id);
      }
    }
  }
  return got;
}

// ── 전시 ────────────────────────────────────────────────────────

async function buildExhibitions(store) {
  const items = [];
  for (const museum of await loadExhibitionsData()) {
    for (const e of museum.temporaryExhibitions || []) {
      if (e.status === 'past' || !e.id) continue;
      const title = e.title || e.name || '';
      // 미술관 이름은 넣지 않는다 — 넣으면 그 미술관 소장품 쪽으로 검색이 쏠린다
      const text = [title, e.description].filter(Boolean).join('. ').slice(0, 500);
      if (text) items.push({ id: e.id, title: title || e.id, text });
    }
  }

  const neighborsFile = join(CACHE, 'neighbors.json');
  const cached = REFRESH ? {} : readJson(neighborsFile, {});
  const neighbors = {};
  const toSearch = [];
  for (const item of items) {
    const hash = sha1(item.text);
    if (cached[item.id]?.hash === hash) neighbors[item.id] = cached[item.id];
    else toSearch.push({ ...item, hash });
  }
  log(`전시 ${items.length}건 — 지난 이웃 재사용 ${items.length - toSearch.length}건, 새로 검색 ${toSearch.length}건`);

  const failures = [];
  await mapPool(toSearch, 3, async (item) => {
    try {
      const data = await withRetries(async () => {
        // 관리 토큰을 붙이면 워커의 요금 상한(속도 제한·하루 총량) 계산에서 빠진다
        const res = await callWorker('/search-by-text', { text: item.text, limit: NEIGHBORS_ASKED, engine: 'jina' }, { admin: true });
        // Jina 가 실패하면 워커가 SigLIP 텍스트 검색으로 넘어가는데, 그 결과는 이 용도에 맞지 않는다
        if (res.engine !== 'jina-clip-v2') throw new Error(`Jina 대신 ${res.engine || '알 수 없는 엔진'} 응답`);
        return res;
      });
      neighbors[item.id] = { hash: item.hash, ids: (data.results || []).map((r) => String(r.id)) };
    } catch (err) {
      failures.push(`${item.title} — ${err.message}`);
    }
  });
  // 끝난 전시의 이웃은 여기서 빠진다
  writeJson(neighborsFile, neighbors);

  const neighborIds = [...new Set(Object.values(neighbors).flatMap((n) => n.ids))];
  const missing = neighborIds.filter((id) => !store.vectors.has(id) && !store.absent.has(id));
  const fetched = await fetchVectors(missing, store.absent, (id, v) => store.vectors.set(id, v));
  log(`이웃 작품 ${neighborIds.length}점 — 벡터 새로 받음 ${fetched}점, 없음 ${neighborIds.filter((id) => store.absent.has(id)).length}점`);

  const background = readJson(join(CACHE, 'background.json'), null);
  if (!background) throw new Error('배경 군집이 없습니다. 먼저 --museums 로 한 번 만드세요.');
  const bgFlat = unpackInt8(background.centroids);
  const bgCount = bgFlat.length / DIM;
  const bgTaste = {
    centroids: Array.from({ length: bgCount }, (_, i) => bgFlat.subarray(i * DIM, (i + 1) * DIM)),
    weights: new Array(bgCount).fill(1 / bgCount),
  };

  const bundleItems = [];
  const vectors = [];
  const skipped = [];
  for (const item of items) {
    const ids = [...new Set(neighbors[item.id]?.ids || [])].filter((id) => store.vectors.has(id)).slice(0, NEIGHBORS_KEPT);
    if (ids.length < NEIGHBORS_MIN) {
      if (neighbors[item.id]) skipped.push(item.title);
      continue;
    }
    bundleItems.push({ id: item.id, count: ids.length, base: 0 });
    vectors.push(...ids.map((id) => store.vectors.get(id)));
  }
  const bundle = { version: '', items: bundleItems, vectors: packInt8(vectors) };
  // 기준점은 워커가 실제로 읽는 값(int8 로 줄였다가 푼 벡터)으로 잰다
  const opened = openExhibitions(bundle);
  bundleItems.forEach((item, i) => {
    item.base = Math.round(exhibitionRaw(bgTaste, opened.vectors, opened.starts[i], item.count) * 1e6) / 1e6;
  });

  log(`점수를 매길 전시 ${bundleItems.length}건${skipped.length ? ` · 이웃 벡터가 모자라 뺀 전시: ${skipped.join(' / ')}` : ''}`);
  if (failures.length) log(`검색 실패 ${failures.length}건:\n  ${failures.join('\n  ')}`);
  if (failures.length > items.length * 0.1) throw new Error('검색 실패가 많아 올리지 않습니다. 지난 데이터가 그대로 쓰입니다.');
  return bundle;
}

// ── 상설 미술관 ─────────────────────────────────────────────────

/**
 * 두 가지를 한번에 만든다: 전시 기준점에 쓰는 배경 군집(항상 필요)과 지도용 미술관 요약.
 * `wantMuseums` 가 false 면 로컬 임베딩 파일만 읽어 배경 군집만 만든다 — 지도를 안 쓸 때
 * 수백 곳의 소장품을 워커에서 받아 채우는 긴 단계를 통째로 건너뛴다.
 */
async function buildMuseums(store, wantMuseums = true) {
  const collectionMuseum = new Map();
  for (const museum of await loadExhibitionsData()) {
    for (const p of museum.permanentExhibitions || []) {
      if (p.id) collectionMuseum.set(String(p.id), museum.id);
      const base = String(p.collectionFile || '').split('/').pop().replace(/\.json$/, '');
      if (base) collectionMuseum.set(base, museum.id);
    }
  }

  // 검색 색인에서 미술관마다 전체 작품 id 를 모은다 (로컬 임베딩에 없는 작품을 받을 때 쓴다)
  const indexIds = new Map();
  for (const file of wantMuseums ? readdirSync(join(ROOT, 'public/data')).filter((f) => /^search-index-part-\d+\.json$/.test(f)) : []) {
    for (const r of JSON.parse(readFileSync(join(ROOT, 'public/data', file), 'utf8'))) {
      const museum = collectionMuseum.get(r.e);
      if (!museum) continue;
      if (!indexIds.has(museum)) indexIds.set(museum, []);
      indexIds.get(museum).push(String(r.id));
    }
  }

  const rand = mulberry32(20260915);
  const reservoir = (list, seen, cap, item) => {
    if (list.length < cap) list.push(item);
    else {
      const j = Math.floor(rand() * seen);
      if (j < cap) list[j] = item;
    }
  };
  const samples = new Map(); // 미술관 → { seen, list }
  const corpus = { seen: 0, sample: [], pool: [] };
  const add = (museum, v) => {
    if (museum) {
      if (!samples.has(museum)) samples.set(museum, { seen: 0, list: [] });
      const s = samples.get(museum);
      s.seen++;
      reservoir(s.list, s.seen, MUSEUM_SAMPLE, v);
    }
    corpus.seen++;
    reservoir(corpus.sample, corpus.seen, CORPUS_SAMPLE, v);
    reservoir(corpus.pool, corpus.seen, BACKGROUND_POOL, v);
  };

  const localIds = new Set();
  for (const file of VECTOR_FILES) {
    if (!existsSync(file)) continue;
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (!line) continue;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        continue; // 기록 중에 끊긴 줄
      }
      if (!Array.isArray(r.vector) || r.vector.length !== DIM || localIds.has(r.id)) continue;
      localIds.add(r.id);
      add(collectionMuseum.get(r.e), normalize(Float32Array.from(r.vector)));
    }
    log(`로컬 벡터 ${file.split('/').pop()} 읽음 (누적 ${localIds.size}점)`);
  }

  if (!wantMuseums) {
    const background = kMeans(corpus.pool, BACKGROUND_K);
    writeJson(join(CACHE, 'background.json'), { builtAt: new Date().toISOString(), centroids: packInt8(background.centroids) });
    log(`배경 군집 ${background.centroids.length}개 만듦 (미술관 요약은 건너뜀)`);
    return null;
  }

  // 로컬 표본이 400점에 못 미치는 미술관은 색인에 있는 나머지 작품을 워커에서 받아 채운다
  let fetched = 0;
  let filledMuseums = 0;
  let checked = 0;
  const notEmbedded = [];
  for (const [museum, ids] of indexIds) {
    const want = MUSEUM_SAMPLE - (samples.get(museum)?.list.length || 0);
    const unseen = ids.filter((id) => !localIds.has(id) && !store.absent.has(id));
    if (want <= 0 || !unseen.length) continue;
    const order = unseen.map((id) => [rand(), id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    let got = 0;
    // 없는 작품이 섞여 있어 모자란 수보다 조금 넉넉히 묻는다
    for (let at = 0; got < want && at < order.length; ) {
      const chunk = order.slice(at, at + Math.min(FETCH_CHUNK, Math.ceil((want - got) * 1.25)));
      at += chunk.length;
      got += await fetchVectors(chunk, store.absent, (_id, v) => add(museum, v));
      // 무작위로 고른 첫 묶음에 벡터가 하나도 없으면 아직 임베딩 전인 컬렉션이다. 수만 점을 끝까지 묻지 않는다.
      if (!got) break;
    }
    fetched += got;
    if (got) filledMuseums++;
    else notEmbedded.push(museum);
    if (++checked % 25 === 0) log(`  채우는 중… ${checked}곳 확인, 벡터 ${fetched}점`);
  }
  log(`워커에서 소장품 벡터 ${fetched}점 받아 ${filledMuseums}곳 채움 · 임베딩이 없어 건너뛴 곳 ${notEmbedded.length}${notEmbedded.length ? ` (${notEmbedded.slice(0, 8).join(', ')}${notEmbedded.length > 8 ? ' …' : ''})` : ''}`);

  const museums = [];
  const prototypes = [];
  const tooFew = [];
  for (const [museum, s] of [...samples.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (s.list.length < MUSEUM_MIN_ARTWORKS) {
      tooFew.push(museum);
      continue;
    }
    const { centroids, weights, tight } = summarizeCollection(s.list);
    museums.push({
      id: museum,
      weights: weights.map((w) => Math.round(w * 1e4) / 1e4),
      tight: tight.map((t) => Math.round(t * 1e4) / 1e4),
    });
    prototypes.push(...centroids);
  }

  const background = kMeans(corpus.pool, BACKGROUND_K);
  writeJson(join(CACHE, 'background.json'), { builtAt: new Date().toISOString(), centroids: packInt8(background.centroids) });
  log(`미술관 요약 ${museums.length}곳 (벡터 ${MUSEUM_MIN_ARTWORKS}점 미만이라 뺀 곳 ${tooFew.length}), 배경 군집 ${background.centroids.length}개`);
  return { version: '', museums, vectors: packInt8(prototypes), sample: packInt8(corpus.sample) };
}

// ── 올리기 ──────────────────────────────────────────────────────

async function publish(kind, bundle) {
  const hash = sha1(JSON.stringify({ ...bundle, version: '' }));
  const publishedFile = join(CACHE, 'published.json');
  const published = readJson(publishedFile, {});
  const size = `${(JSON.stringify(bundle).length / 1e6).toFixed(1)}MB`;
  if (DRY_RUN) {
    writeJson(join(CACHE, `${kind}.dry-run.json`), bundle);
    log(`${kind}: dry-run — ${size}, .cache 에 저장만 함`);
    return;
  }
  if (published[kind]?.hash === hash) {
    log(`${kind}: 지난번에 올린 데이터와 같아 올리지 않음`);
    return;
  }
  bundle.version = new Date().toISOString().replace(/[:.]/g, '-');
  const res = await withRetries(() => callWorker(`/taste-data?kind=${kind}`, JSON.stringify(bundle), { admin: true, method: 'PUT' }));
  writeJson(publishedFile, { ...published, [kind]: { hash, key: res.key, at: new Date().toISOString() } });
  log(`${kind}: 올림 → ${res.key} (${size})`);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  // 벡터·이웃 캐시는 커밋하지 않는다
  if (!existsSync(join(CACHE, '.gitignore'))) writeFileSync(join(CACHE, '.gitignore'), '*\n');
  if (!TOKEN) throw new Error('ADMIN_TOKEN 이 없습니다 (workers/semantic-search/.env 또는 환경 변수 TASTE_ADMIN_TOKEN).');

  const store = loadVectorCache();
  try {
    if (MUSEUMS) await publish('museums', await buildMuseums(store));
    // 전시 기준점은 배경 군집을 쓴다. 지도를 안 쓰더라도 이것만은 한 번 만들어야 한다.
    else if (!existsSync(join(CACHE, 'background.json'))) await buildMuseums(store, false);
    await publish('exhibitions', await buildExhibitions(store));
  } finally {
    saveVectorCache(store);
  }
}

main().catch((err) => {
  console.error(`\n💥 취향 데이터 빌드 실패: ${err.message}`);
  process.exit(1);
});
