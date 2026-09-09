// ColBase (国立文化財機構 소장품 통합 DB) 수집기.
//
// 기존 scripts/scrape-nich-full.cjs 가 organization_id=1(東京国立博物館) 전용이었던 것을
// 기관 파라미터로 일반화하고, canonical 스키마 + R2 업로드 + 스코프 필터를 붙였다.
//
//   node scripts/scrape-colbase.mjs kyohaku --limit 30   # 파일럿
//   node scripts/scrape-colbase.mjs kyohaku              # 전체
//
// 이미지: thumbnail_url 을 regular 로 치환해 큰 쪽을 먼저 시도하고, 404면 thumbnail 로 폴백한다.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import dotenv from 'dotenv';
import { judgeImage, toWebp, IN_SCOPE } from './lib/scope-filter.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

export const ORGS = {
  kyohaku: { orgId: 2, id: 'kyoto-national-museum', name: 'Kyoto National Museum', name_ko: '교토국립박물관',
             site: 'https://www.kyohaku.go.jp/', lat: 34.9899, lng: 135.7728, city: 'Kyoto' },
  // organization_id 1 = 東京国立博物館 은 이미 nich-collection.json 으로 앱에 있다.
  // 3(奈良)·4(九州)는 Painting/Asian Painting 분류 건수가 0이라 대상 아님.
};

const API = 'https://colbase.nich.go.jp/colbaseapi/v2/collection_items';
const HEADERS = { 'x-api-key': 'aaa', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
// 5로 돌렸더니 이미지 요청의 절반이 실패했고, 같은 URL을 하나씩 다시 부르면 200이 왔다.
// 소스가 동시 요청을 조이는 것이므로 동시성을 낮추고 재시도를 붙인다.
const CONCURRENCY = 2;

/**
 * ColBase bunrui → canonical.
 * ⚠️ 서예(calligraphy)는 제외한다 — 교토국립박물관 632점을 실제로 보니 흑백 사경·와카
 * 단자쿠가 대부분이라 시각 그리드에서 구분이 안 되고 SigLIP 유사도도 의미가 없었다.
 */
function toCategory(bunrui) {
  const s = (bunrui || '').toLowerCase();
  if (/painting/.test(s)) return 'painting';
  if (/print|ukiyo/.test(s)) return 'print';
  return null;
}

/**
 * ColBase 의 연대는 "Momoyama ・16th～17th", "Kamakura ・13th" 처럼 시대명 + 세기다.
 * jidai_from 은 이 컬렉션에서 전부 null 이므로 세기를 서기로 환산한다.
 * 범위면 가장 이른 쪽(가이드: "추정이면 가장 빠른 추정치").
 */
function toYear(rec) {
  if (Number.isFinite(rec.jidai_from)) return Number(rec.jidai_from);
  const s = String(rec.jidai_seiki || '');
  const abs = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (abs) return Number(abs[1]);
  const cent = s.match(/(\d{1,2})(?:st|nd|rd|th)/);       // en: "13th"
  if (cent) return (Number(cent[1]) - 1) * 100;
  const centJa = s.match(/(\d{1,2})世紀/);                  // ja: "19世紀"
  if (centJa) return (Number(centJa[1]) - 1) * 100;
  return null;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

// ColBase 는 JSON API 라 HTML 파서를 거치지 않는다. 그런데 제목·해설에 &quot; 같은
// 엔티티가 그대로 들어 있어(97건) 화면에 문자 그대로 보인다. 저장 전에 푼다.
const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ',
                   lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d' };
function decodeEntities(v) {
  return String(v || '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(Number(e[1] === 'x' || e[1] === 'X' ? '0' + e.slice(1) : e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// ⚠️ ColBase 는 부하가 걸리면 **404 를 스로틀 응답으로 돌려준다.**
// 같은 URL 24개를 동시 3으로 받으면 15개가 404, 동시 2+300ms 면 4개, 순차면 1개였다.
// 따라서 404 를 "이미지 없음"으로 단정하면 안 되고, 재시도 대상에 포함해야 한다.
// 대신 전역 스로틀로 요청 간격을 벌려 404 자체가 덜 나오게 한다.
const MIN_GAP_MS = 350;
let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function grab(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    await throttle();
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* 네트워크 오류 → 재시도 */ }
    await new Promise(res => setTimeout(res, 1500 * 2 ** i));   // 1.5s, 3s, 6s, 12s, 24s
  }
  return null;
}

async function main() {
  const key = process.argv[2];
  const O = ORGS[key];
  if (!O) { console.error(`기관을 지정하세요: ${Object.keys(ORGS).join(', ')}`); process.exit(1); }
  const args = process.argv.slice(3);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  const STATE = path.join(ROOT, 'scripts/.state');
  fs.mkdirSync(STATE, { recursive: true });
  const PROGRESS = path.join(STATE, `${O.id}-progress.json`);
  const REJECT = path.join(STATE, `${O.id}-rejected.ndjson`);
  const OUT = path.join(ROOT, `public/data/${O.id}-collection.json`);
  const PREFIX = `artworks/${O.id}-collection`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  // ── 목록 (영·일 두 로케일을 합쳐 제목/작가를 양쪽 다 확보) ────────────────
  const fetchAll = async (locale) => {
    const out = new Map();
    for (let page = 1; ; page++) {
      const q = new URLSearchParams({
        locale, limit: '100', page: String(page), with_image_file: '1', only_parent: '0',
        bunrui: locale === 'en' ? 'Painting,Asian Painting' : '絵画,東洋絵画',
        organization_id: String(O.orgId),
      });
      const r = await fetch(`${API}?${q}`, { headers: HEADERS, signal: AbortSignal.timeout(45000) });
      if (!r.ok) break;
      const d = await r.json();
      const rows = d.results || [];
      rows.forEach(x => out.set(String(x.id), x));
      if (page === 1) console.log(`[${O.id}] ${locale} 총 ${d.resultset?.count ?? '?'}건`);
      if (rows.length < 100) break;
    }
    return out;
  };
  // 로케일별 결과셋의 id 가 서로 겹치지 않아(교집합 0) 병합이 불가능하다.
  // 영문 레코드만 쓴다 — 일문에도 hinshitu_keijo(재료)는 비어 있어 얻을 게 없다.
  const en = await fetchAll('en');
  console.log(`[${O.id}] 대상 ${en.size}건`);

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    // 일시적 실패(네트워크·스로틀)만 되돌린다. 스코프밖·흑백·저해상은 판정이 끝난 것이므로 유지.
    let n = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:/.test(v.skip)) { done.delete(k); n++; }
    console.log(`[${O.id}] 일시적 실패 ${n}건 재시도 대상으로 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const all = [...en.values()];
  const todo = all.filter(x => !done.has(String(x.id))).slice(0, LIMIT);
  console.log(`[${O.id}] 이번 실행 ${todo.length}건 (완료 ${done.size}건)\n`);

  const stat = { kept: 0, noImage: 0, outOfScope: 0, grayscale: 0, small: 0, failed: 0 };
  const lim = pLimit(CONCURRENCY);
  let n = 0;

  await Promise.all(todo.map(rec => lim(async () => {
    const id = String(rec.id);
    const rej = (reason, extra) => { rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n'); done.set(id, { skip: reason }); };
    // 거부 분기는 return 으로 빠지므로 진행 카운터를 여기서 함께 올린다.
    const tick = () => {
      if (++n % 200 === 0) {
        console.log(`[${O.id}] ${n}/${todo.length} — 수집 ${stat.kept} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);
        fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
      }
    };
    try {
      const category = toCategory(rec.bunrui);
      if (!category || !IN_SCOPE.has(category)) { stat.outOfScope++; rej('out-of-scope', { bunrui: rec.bunrui }); tick(); return; }

      const thumb = rec.thumbnail_url || '';
      if (!thumb) { stat.noImage++; rej('no-image'); tick(); return; }
      const abs = u => u.startsWith('http') ? u : `https://colbase.nich.go.jp${u}`;
      const regular = abs(thumb).replace('/thumbnail/', '/regular/');
      // 큰 쪽 우선, 없으면 썸네일로 폴백 (같은 레코드라도 한쪽만 있는 경우가 있다).
      // regular 이 정말 없는 레코드도 있으므로 여기선 재시도를 짧게 하고,
      // 최종 폴백인 thumb 쪽에 재시도를 몰아준다.
      let src = regular, buf = await grab(regular, 2);
      if (!buf) { src = abs(thumb); buf = await grab(src, 5); }
      if (!buf) { stat.failed++; rej('image-fetch-failed'); tick(); return; }

      const verdict = await judgeImage(buf, category);
      if (!verdict.ok) {
        if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
        rej(verdict.reason, { category }); tick(); return;
      }

      const k = `${PREFIX}/${O.id}-${id}-${sha8(src)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: k, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));
      done.set(id, {
        key: k, category, src,
        title: decodeEntities(rec.title) || 'Untitled',
        artist: decodeEntities(rec.sakusha) || 'Unknown',
        date: decodeEntities(rec.jidai_seiki),
        year: toYear(rec),
        medium: decodeEntities(rec.hinshitu_keijo),
        dimensions: decodeEntities(rec.houryo),
        objNo: rec.organization_item_key || '',
        desc: decodeEntities(rec.descriptions).slice(0, 1200),
      });
      stat.kept++;
    } catch (e) { stat.failed++; rej('error: ' + e.message); }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[${O.id}] 완료 — 수집 ${stat.kept} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${O.id}-${id}`,
      objectNumber: r.objNo || '',
      title: r.title, artist: r.artist,
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: r.dimensions || '',
      category: r.category, description: r.desc || '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: false, displayLocation: '',
      sourceUrl: `https://colbase.nich.go.jp/collection_items/${O.id === 'kyoto-national-museum' ? 'kyohaku' : ''}/${id}?locale=en`,
      metadata: {},
      original_imageUrl: r.src,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: O.name, museum_ko: O.name_ko, collection: 'Painting',
      website: O.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'api', artworks,
    }, null, 2));
    console.log(`[${O.id}] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[${O.id}] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
