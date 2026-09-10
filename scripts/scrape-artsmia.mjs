// Minneapolis Institute of Art (Mia) 수집기 — GitHub 오픈데이터 + 헤드리스 이미지.
//
// 두 소스를 합친다:
//   1) 메타데이터: github.com/artsmia/collection 의 wcma 스타일 JSON 덤프(17,293건, CC0).
//      title/artist/dated/medium/classification/dimension 이 다 들어 있다.
//   2) 이미지 URL: 상세 페이지(collections.artsmia.org/art/{id})가 JS 렌더링이라
//      Playwright 로 열어 img.artsmia.org 주소를 얻는다. GitHub 데이터에는 이 주소가 없다.
//      `_800.jpg` 를 `_full.jpg` 로 바꾸면 3140px 급 원본이 나온다(1200/2000 은 403).
//
//   node scripts/scrape-artsmia.mjs --limit 20   # 파일럿
//   node scripts/scrape-artsmia.mjs              # 전체
//   node scripts/scrape-artsmia.mjs --resume

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { judgeImage, toWebp, IN_SCOPE, isPreModernPhoto } from './lib/scope-filter.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

export const MUSEUM = {
  id: 'artsmia',
  name: 'Minneapolis Institute of Art',
  name_ko: '미니애폴리스 미술관',
  site: 'https://collections.artsmia.org/',
  lat: 44.9585, lng: -93.2736, city: 'Minneapolis',
};

const DUMP = 'https://raw.githubusercontent.com/artsmia/collection/main/wcma-collection-utf8.json';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = `artworks/${MUSEUM.id}-collection`;
const PAGES = 4;

/** Mia classification → canonical. 스코프 밖이면 null, 판단 불가면 undefined. */
function toCategory(cls, medium) {
  const s = `${cls || ''} ${medium || ''}`;
  if (/Sculpture|Ceramic|Furniture|Textile|Metalwork|Jewelry|Glass|Costume|Arms|Vessel|Tools|Lighting|Jade|Lacquer/i.test(s)) return null;
  if (/Print|Woodblock|Lithograph|Etching|Engraving|Screenprint|Ukiyo/i.test(s)) return 'print';
  if (/Photograph|Gelatin silver|Albumen|Daguerreotype/i.test(s)) return 'photograph';
  if (/Video|Film|Time-based/i.test(s)) return 'video';
  if (/Drawing|Watercolor|Pastel|Charcoal|Graphite|Chalk|Ink/i.test(s)) return 'drawing';
  if (/Painting|Oil|Tempera|Acrylic|Canvas|Panel/i.test(s)) return 'painting';
  return undefined;
}

function toYear(rec) {
  const b = Number(rec.creation_date_earliest);
  if (Number.isFinite(b) && b > 0) return b;
  const s = String(rec.creation_date || rec.dated || '');
  const m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (m) return Number(m[1]);
  const c = s.match(/(\d{1,2})(?:st|nd|rd|th)\s*(?:century|c\.)/i);
  return c ? (Number(c[1]) - 1) * 100 : null;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function main() {
  const args = process.argv.slice(2);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  const STATE = path.join(ROOT, 'scripts/.state');
  fs.mkdirSync(STATE, { recursive: true });
  const PROGRESS = path.join(STATE, `${MUSEUM.id}-progress.json`);
  const REJECT = path.join(STATE, `${MUSEUM.id}-rejected.ndjson`);
  const CACHE = path.join(STATE, `${MUSEUM.id}-dump.json`);
  const OUT = path.join(ROOT, `public/data/${MUSEUM.id}-collection.json`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  let records;
  if (fs.existsSync(CACHE)) {
    records = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    console.log(`[mia] 캐시된 덤프 ${records.length}건 재사용`);
  } else {
    console.log('[mia] GitHub 덤프 내려받는 중…');
    const r = await fetch(DUMP, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300000) });
    const j = await r.json();
    records = Array.isArray(j) ? j : Object.values(j)[0];
    fs.writeFileSync(CACHE, JSON.stringify(records));
    console.log(`[mia] 덤프 ${records.length}건`);
  }

  // 스코프 사전 판정 — 공예·조각이 많아 페이지를 열기 전에 걸러낸다
  const pre = { outOfScope: 0, noId: 0 };
  const candidates = [];
  for (const rec of records) {
    const idNum = String(rec.id || '').match(/(\d+)\s*$/)?.[1];
    if (!idNum) { pre.noId++; continue; }
    const category = toCategory(rec.classification, rec.medium);
    if (!category || !IN_SCOPE.has(category)) { pre.outOfScope++; continue; }
    candidates.push({ rec, idNum, category });
  }
  // 회화 → 드로잉 → 판화 → 사진 순으로 처리한다. 중간에 멈춰도 가치 높은 것부터 남는다.
  const ORDER = { painting: 0, drawing: 1, print: 2, photograph: 3, video: 4 };
  candidates.sort((a, b) => (ORDER[a.category] ?? 9) - (ORDER[b.category] ?? 9));
  console.log(`[mia] 스코프밖 ${pre.outOfScope} · id없음 ${pre.noId} → 후보 ${candidates.length}건`);

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:|render/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[mia] 일시적 실패 ${r}건 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const todo = candidates.filter(c => !done.has(c.idNum)).slice(0, LIMIT);
  console.log(`[mia] 이번 실행 ${todo.length}건 (완료 ${done.size})\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA });
  await ctx.route('**/*', route => {
    const t = route.request().resourceType();
    return (t === 'image' || t === 'font' || t === 'media') ? route.abort() : route.continue();
  });

  const stat = { kept: 0, noImage: 0, grayscale: 0, small: 0, failed: 0 };
  let n = 0;
  const queue = [...todo];

  const worker = async () => {
    const page = await ctx.newPage();
    for (;;) {
      const item = queue.shift();
      if (!item) break;
      const { rec, idNum, category } = item;
      const rej = (reason, extra) => { rejects.write(JSON.stringify({ id: idNum, reason, ...extra }) + '\n'); done.set(idNum, { skip: reason }); };
      try {
        await page.goto(`https://collections.artsmia.org/art/${idNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(
          () => [...document.querySelectorAll('img')].some(i => /img\.artsmia\.org/.test(i.src)),
          null, { timeout: 15000 },
        ).catch(() => {});

        const src800 = await page.evaluate(() =>
          [...document.querySelectorAll('img')].map(i => i.src).find(s => /img\.artsmia\.org/.test(s)) || '');
        if (!src800) { stat.noImage++; rej('no-image'); }
        else {
          // _800 → _full 이 3000px 급. 1200/2000 은 403 이라 두 단계만 시도한다.
          const full = src800.replace(/_\d+\.jpg$/, '_full.jpg');
          let src = full;
          let ir = await fetch(full, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }).catch(() => null);
          if (!ir || !ir.ok) { src = src800; ir = await fetch(src800, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }).catch(() => null); }
          if (!ir || !ir.ok) { stat.failed++; rej('image-fetch-failed'); }
          else {
            const buf = Buffer.from(await ir.arrayBuffer());
            const year = toYear(rec);
            if (isPreModernPhoto(category, year)) { rej('photo-pre-1920'); }
            else {
              const verdict = await judgeImage(buf, category);
              if (!verdict.ok) {
                if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
                rej(verdict.reason, { category });
              } else {
                const key = `${PREFIX}/${MUSEUM.id}-${idNum}-${sha8(src)}-imageUrl.webp`;
                await s3.send(new PutObjectCommand({
                  Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
                  CacheControl: 'public, max-age=31536000',
                }));
                done.set(idNum, {
                  key, category, src, year,
                  title: rec.title || 'Untitled',
                  // Mia 는 역할을 접두로 붙인다("artist: Frederick G. Smith", "artist: China").
                  // 역할 접두를 떼야 앱의 작가 매칭이 붙는다.
                  artist: String(rec.maker || rec.artist || 'Unknown')
                    .replace(/^\s*(?:artist|maker|designer|manufacturer|publisher|printer|after|attributed to)\s*:\s*/i, '')
                    .trim() || 'Unknown',
                  date: rec.creation_date || rec.dated || '',
                  medium: rec.medium || '',
                  dimensions: rec.dimensions || rec.dimension || '',
                  objNo: rec.accession_number || '',
                  desc: String(rec.description || '').slice(0, 1200),
                });
                stat.kept++;
              }
            }
          }
        }
      } catch (e) {
        stat.failed++; rej('render-error: ' + String(e.message).slice(0, 60));
      }
      if (++n % 100 === 0) {
        console.log(`[mia] ${n}/${todo.length} — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);
        fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
      }
    }
    await page.close();
  };

  await Promise.all(Array.from({ length: PAGES }, worker));
  await browser.close();

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[mia] 완료 — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${MUSEUM.id}-${id}`,
      objectNumber: r.objNo || '',
      title: r.title, artist: r.artist,
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: r.dimensions || '',
      category: r.category, description: r.desc || '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: false, displayLocation: '',
      sourceUrl: `https://collections.artsmia.org/art/${id}`,
      metadata: {}, original_imageUrl: r.src,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: MUSEUM.name, museum_ko: MUSEUM.name_ko, collection: 'Collection',
      website: MUSEUM.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'opendata+rendered', artworks,
    }, null, 2));
    console.log(`[mia] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[mia] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
