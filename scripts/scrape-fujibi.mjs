// 東京富士美術館 (Tokyo Fuji Art Museum) 수집기 — 헤드리스 브라우저.
//
// 소스: www.fujibi.or.jp. 작품 상세가 **완전 JS 렌더링**이라 일반 HTTP 로는 본문이 비어 있다.
//   목록도 JS 라 sitemap(artwork-sitemap{,2..5}.xml, 총 4,176건)에서 URL 을 얻는다.
//   상세는 Playwright 로 렌더한 뒤 innerText 와 img 를 읽는다.
// 이미지: /assets/images/artwork/source/{n}.jpg — 950px 안팎. 없는 작품은 noimage.jpg 를 준다.
//
//   node scripts/scrape-fujibi.mjs --limit 20   # 파일럿
//   node scripts/scrape-fujibi.mjs              # 전체
//   node scripts/scrape-fujibi.mjs --resume

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
  id: 'tokyo-fuji-art',
  name: 'Tokyo Fuji Art Museum',
  name_ko: '도쿄후지미술관',
  site: 'https://www.fujibi.or.jp/',
  lat: 35.6664, lng: 139.3239, city: 'Hachioji',
};

const SITEMAPS = [1, 2, 3, 4, 5].map(n => `https://www.fujibi.or.jp/artwork-sitemap${n === 1 ? '' : n}.xml`);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = `artworks/${MUSEUM.id}-collection`;
const PAGES = 4;   // 동시에 여는 탭 수. 브라우저 메모리와 사이트 부하의 균형.

/** 技法 텍스트 → canonical. 조각·공예는 스코프 밖. */
function toCategory(medium) {
  const s = String(medium || '');
  if (/ブロンズ|大理石|石膏|木彫|鋳造|陶|磁|漆|ガラス|金工|彫刻/.test(s)) return null;
  if (/リトグラフ|石版|木版|銅版|エッチング|シルクスクリーン|版画|ドライポイント|アクアチント/.test(s)) return 'print';
  if (/写真|ゼラチン|印画紙/.test(s)) return 'photograph';
  if (/素描|デッサン|鉛筆|木炭|パステル|コンテ|ペン|インク|水彩/.test(s)) return 'drawing';
  if (/油彩|油絵|テンペラ|アクリル|岩絵具|絹本|紙本|着色|カンヴァ|画布|板|紙/.test(s)) return 'painting';
  return undefined;
}

/** "昭和5年（1930）" · "1930年" → 서기 */
function toYear(s) {
  const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (m) return Number(m[1]);
  const c = String(s || '').match(/(\d{1,2})世紀/);
  return c ? (Number(c[1]) - 1) * 100 : null;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

/**
 * 렌더된 페이지에서 작품 정보를 뽑는다.
 * 라벨-값 구조(dt/dd, th/td)가 없고 한 덩어리 텍스트라
 *   "雪景 雪景 Snowy Landscape 昭和5年（1930）／油彩、カンヴァス 72.0×90.0cm"
 * 처럼 이어지므로 "연도／재료" "숫자×숫자cm" 패턴으로 끊는다.
 */
function parseBody(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const start = t.indexOf('収蔵品詳細');
  const body = start >= 0 ? t.slice(start + 6) : t;
  const seg = body.replace(/^.*?HOME\s*/, '').trim();

  const dim = (seg.match(/([\d.]+\s*[×x]\s*[\d.]+(?:\s*[×x]\s*[\d.]+)?\s*cm)/) || [])[1] || '';
  const dateMedium = (seg.match(/((?:明治|大正|昭和|平成|令和)?\s*[\d]+\s*年?(?:（\d{4}）)?\s*／\s*[^0-9]{1,40})/) || [])[1] || '';
  const [dateRaw, mediumRaw] = dateMedium.split('／').map(s => (s || '').trim());

  // 제목은 본문 맨 앞. 일본어 제목이 두 번 반복된 뒤 영문이 오는 형태가 흔하다.
  const head = seg.split(/(?:明治|大正|昭和|平成|令和)?\s*[\d]+\s*年?(?:（\d{4}）)?\s*／/)[0].trim();
  const latin = (head.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9 ,.'’()\-:;&]*$/) || [])[0];
  const titleEn = latin && latin.replace(/[^A-Za-zÀ-ɏ]/g, '').length >= 3 ? latin.trim() : '';
  const titleJa = titleEn ? head.slice(0, head.length - titleEn.length).trim() : head;
  // 일본어 제목이 두 번 반복되면 하나로 줄인다
  const half = titleJa.slice(0, Math.floor(titleJa.length / 2)).trim();
  const titleJaClean = half && titleJa.endsWith(half) && half.length > 1 ? half : titleJa;

  // 작가는 "ARTIST 作家解説 海老原喜之助 Ebihara Kinosuke 1904-1970 <약력…>" 구간에 있다.
  // 한국 사용자와 앱의 작가 매칭을 위해 로마자 표기를 우선한다(다른 일본 컬렉션과 동일 규칙).
  let artist = '', artistJa = '';
  const am = t.match(/ARTIST\s*作家解説\s*(.+?)(?:\s*\d{4}\s*[-–]\s*\d{0,4}|\s*同じ作家|\s*収蔵品データベース)/);
  if (am) {
    const chunk = am[1].trim();
    const lat = chunk.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ.'’\- ]*$/);
    if (lat && lat[0].replace(/[^A-Za-zÀ-ɏ]/g, '').length >= 3) {
      artist = lat[0].trim();
      artistJa = chunk.slice(0, chunk.length - lat[0].length).trim();
    } else {
      artistJa = chunk;
    }
  }

  return { titleEn, titleJa: titleJaClean, date: dateRaw, medium: mediumRaw, dimensions: dim, artist, artistJa };
}

async function main() {
  const args = process.argv.slice(2);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  const STATE = path.join(ROOT, 'scripts/.state');
  fs.mkdirSync(STATE, { recursive: true });
  const PROGRESS = path.join(STATE, `${MUSEUM.id}-progress.json`);
  const REJECT = path.join(STATE, `${MUSEUM.id}-rejected.ndjson`);
  const URLS = path.join(STATE, `${MUSEUM.id}-urls.json`);
  const OUT = path.join(ROOT, `public/data/${MUSEUM.id}-collection.json`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  let urls;
  if (RESUME && fs.existsSync(URLS)) {
    urls = JSON.parse(fs.readFileSync(URLS, 'utf8'));
    console.log(`[fujibi] 저장된 URL ${urls.length}건 재사용`);
  } else {
    const set = new Set();
    for (const sm of SITEMAPS) {
      const r = await fetch(sm, { headers: { 'User-Agent': UA } }).catch(() => null);
      if (!r || !r.ok) continue;
      for (const m of (await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) {
        if (/\/collection\/artwork\/\d+/.test(m[1])) set.add(m[1]);
      }
    }
    urls = [...set];
    fs.writeFileSync(URLS, JSON.stringify(urls));
    console.log(`[fujibi] sitemap 작품 URL ${urls.length}건`);
  }

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:|render/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[fujibi] 일시적 실패 ${r}건 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const slugOf = u => u.replace(/\/$/, '').split('/').pop();
  const todo = urls.filter(u => !done.has(slugOf(u))).slice(0, LIMIT);
  console.log(`[fujibi] 이번 실행 ${todo.length}건 (완료 ${done.size})\n`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: UA });
  // 이미지·폰트는 페이지 렌더에 필요 없다(우리가 따로 받는다). 막으면 훨씬 빠르다.
  await ctx.route('**/*', route => {
    const t = route.request().resourceType();
    return (t === 'image' || t === 'font' || t === 'media') ? route.abort() : route.continue();
  });

  const stat = { kept: 0, noImage: 0, outOfScope: 0, grayscale: 0, small: 0, failed: 0 };
  let n = 0;
  const queue = [...todo];

  const worker = async () => {
    const page = await ctx.newPage();
    for (;;) {
      const url = queue.shift();
      if (!url) break;
      const id = slugOf(url);
      const rej = (reason, extra) => { rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n'); done.set(id, { skip: reason }); };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // 고정 대기(900ms)로는 본문이 덜 차서 medium 이 빈 값으로 읽혔다(100건 중 80건 스코프밖).
        // 작품 정보 블록의 표식인 "収蔵品詳細" + 치수(…cm)가 나타날 때까지 기다린다.
        await page.waitForFunction(
          () => /収蔵品詳細/.test(document.body.innerText) && /[\d.]+\s*[×x]\s*[\d.]+\s*cm/.test(document.body.innerText),
          null, { timeout: 20000 },
        ).catch(() => {});   // 정말 정보가 없는 페이지도 있으므로 실패해도 진행
        const got = await page.evaluate(() => ({
          text: document.body.innerText,
          img: [...document.querySelectorAll('img')].map(i => i.src)
            .find(s => /\/artwork\/source\//.test(s) && !/noimage/i.test(s)) || '',
        }));

        if (!got.img) { stat.noImage++; rej('no-image'); }
        else {
          const f = parseBody(got.text);
          const category = toCategory(f.medium);
          if (!category || !IN_SCOPE.has(category)) {
            stat.outOfScope++; rej('out-of-scope', { medium: (f.medium || '').slice(0, 30) });
          } else {
            const year = toYear(f.date);
            if (isPreModernPhoto(category, year)) { stat.outOfScope++; rej('photo-pre-1920'); }
            else {
              const ir = await fetch(got.img, { headers: { 'User-Agent': UA, Referer: MUSEUM.site }, signal: AbortSignal.timeout(60000) }).catch(() => null);
              if (!ir || !ir.ok) { stat.failed++; rej('image-fetch-failed'); }
              else {
                const buf = Buffer.from(await ir.arrayBuffer());
                const verdict = await judgeImage(buf, category);
                if (!verdict.ok) {
                  if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
                  rej(verdict.reason, { category });
                } else {
                  const key = `${PREFIX}/${MUSEUM.id}-${id}-${sha8(got.img)}-imageUrl.webp`;
                  await s3.send(new PutObjectCommand({
                    Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
                    CacheControl: 'public, max-age=31536000',
                  }));
                  done.set(id, { key, category, src: got.img, year, url, ...f });
                  stat.kept++;
                }
              }
            }
          }
        }
      } catch (e) {
        stat.failed++; rej('render-error: ' + String(e.message).slice(0, 60));
      }
      if (++n % 100 === 0) {
        console.log(`[fujibi] ${n}/${todo.length} — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 실패 ${stat.failed}`);
        fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
      }
    }
    await page.close();
  };

  await Promise.all(Array.from({ length: PAGES }, worker));
  await browser.close();

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[fujibi] 완료 — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${MUSEUM.id}-${id}`,
      objectNumber: id,
      // 한국 사용자에게 일본어는 읽히지 않으므로 영문 제목을 우선한다(다른 일본 컬렉션과 동일 규칙).
      title: r.titleEn || r.titleJa || 'Untitled',
      artist: r.artist || r.artistJa || 'Unknown',
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: r.dimensions || '',
      category: r.category, description: '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: false, displayLocation: '',
      sourceUrl: r.url,
      metadata: {
        ...(r.titleJa && r.titleJa !== r.titleEn ? { title_ja: r.titleJa } : {}),
        ...(r.artistJa && r.artistJa !== r.artist ? { artist_ja: r.artistJa } : {}),
      },
      original_imageUrl: r.src,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: MUSEUM.name, museum_ko: MUSEUM.name_ko, collection: 'Collection',
      website: MUSEUM.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'html-rendered', artworks,
    }, null, 2));
    console.log(`[fujibi] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[fujibi] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
