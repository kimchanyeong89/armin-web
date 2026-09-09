// ポーラ美術館 (Pola Museum of Art, 하코네) 수집기.
//
// 소스: www.polamuseum.or.jp — WordPress.
//   목록 페이지는 6건씩만 노출하지만 sitemap(`wp-sitemap-posts-collection-1.xml`)에
//   작품 URL 1,223개가 그대로 들어 있다. 목록을 뚫을 필요가 없다.
// 이미지: /collection_images/{n}.jpg — 1500px 안팎.
//
//   node scripts/scrape-pola.mjs --limit 30   # 파일럿
//   node scripts/scrape-pola.mjs              # 전체

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import dotenv from 'dotenv';
import { judgeImage, toWebp, IN_SCOPE, isPreModernPhoto } from './lib/scope-filter.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

export const MUSEUM = {
  id: 'pola-museum',
  name: 'Pola Museum of Art',
  name_ko: '폴라미술관',
  site: 'https://www.polamuseum.or.jp/',
  lat: 35.2447, lng: 139.0122, city: 'Hakone',
};

const SITEMAP = 'https://www.polamuseum.or.jp/wp-sitemap-posts-collection-1.xml';
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36' };
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = `artworks/${MUSEUM.id}-collection`;
const CONCURRENCY = 5;

/** 技法・素材 + 분류 → canonical. 유리공예·화장도구는 스코프 밖(폴라는 그 컬렉션도 크다). */
function toCategory(medium, category) {
  const s = `${medium || ''} ${category || ''}`;
  if (/ガラス|陶|磁|漆|金工|彫刻|ブロンズ|化粧道具|工芸|櫛|簪|蒔絵/.test(s)) return null;
  if (/版画|リトグラフ|木版|銅版|エッチング|シルクスクリーン/.test(s)) return 'print';
  if (/写真|ゼラチン|プリント/.test(s)) return 'photograph';
  if (/映像|ビデオ/.test(s)) return 'video';
  if (/素描|デッサン|鉛筆|木炭|パステル|コンテ|ペン|インク/.test(s)) return 'drawing';
  if (/油彩|水彩|テンペラ|アクリル|グアッシュ|日本画|岩絵具|絹本|紙本|カンヴァ|画布|板/.test(s)) return 'painting';
  return null;
}

function toYear(s) {
  const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (m) return Number(m[1]);
  const c = String(s || '').match(/(\d{1,2})世紀/);
  return c ? (Number(c[1]) - 1) * 100 : null;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (r.ok) return r;
      if (r.status === 404) return null;
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 900 * (i + 1)));
  }
  return null;
}

/**
 * 상세 페이지 메타는 dt/dd 도 th/td 도 아니고
 *   <li><span class="t">作家名</span><span class="name">クロード・モネ</span></li>
 * 형태의 span 쌍이다. 라벨 span(.t) 의 다음 형제가 값이다.
 */
function parseFields($) {
  const kv = {};
  $('span.t').each((_, el) => {
    const k = $(el).text().trim();
    const v = $(el).next('span').text().trim().replace(/\s+/g, ' ');
    if (k && v) kv[k] = v;
  });
  return kv;
}

async function main() {
  const args = process.argv.slice(2);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  const STATE = path.join(ROOT, 'scripts/.state');
  fs.mkdirSync(STATE, { recursive: true });
  const PROGRESS = path.join(STATE, `${MUSEUM.id}-progress.json`);
  const REJECT = path.join(STATE, `${MUSEUM.id}-rejected.ndjson`);
  const OUT = path.join(ROOT, `public/data/${MUSEUM.id}-collection.json`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  const sm = await get(SITEMAP);
  if (!sm) { console.error('sitemap 접근 실패'); process.exit(1); }
  const urls = [...new Set([...(await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]))]
    .filter(u => /\/collection\//.test(u));
  console.log(`[pola] ${MUSEUM.name_ko} — sitemap 작품 ${urls.length}건`);

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[pola] 일시적 실패 ${r}건 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const slugOf = u => u.replace(/\/$/, '').split('/').pop();
  const todo = urls.filter(u => !done.has(slugOf(u))).slice(0, LIMIT);
  console.log(`[pola] 이번 실행 ${todo.length}건 (완료 ${done.size})\n`);

  const stat = { kept: 0, noImage: 0, outOfScope: 0, grayscale: 0, small: 0, failed: 0 };
  const lim = pLimit(CONCURRENCY);
  let n = 0;
  const tick = () => {
    if (++n % 200 === 0) {
      console.log(`[pola] ${n}/${todo.length} — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 실패 ${stat.failed}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
    }
  };

  await Promise.all(todo.map(url => lim(async () => {
    const id = slugOf(url);
    const rej = (reason, extra) => { rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n'); done.set(id, { skip: reason }); };
    try {
      const res = await get(url);
      if (!res) { stat.failed++; rej('detail-fetch-failed'); tick(); return; }
      const $ = cheerio.load(await res.text());
      const kv = parseFields($);

      // 일문 페이지는 작가·재료가 가타카나("エドガー・ドガ")라 한국 사용자에게 읽히지 않고
      // 앱의 작가 매칭에도 안 붙는다. 같은 id 의 /en/ 페이지가 "Edgar Degas"를 주므로 그쪽을 쓴다.
      const enRes = await get(url.replace('/collection/', '/en/collection/'));
      let en = {}, titleEn = '';
      if (enRes) {
        const $en = cheerio.load(await enRes.text());   // 응답 본문은 한 번만 읽는다
        en = parseFields($en);
        titleEn = $en('title').text().split('|')[0].trim();
      }

      const titleJa = ($('h1').first().text().trim() || $('title').text().split('|')[0].trim());
      const title = titleEn || titleJa;
      if (!title) { rej('no-title'); tick(); return; }

      const category = toCategory(kv['技法・素材'] || kv['技法／素材'], kv['分類']);
      if (!category || !IN_SCOPE.has(category)) {
        stat.outOfScope++; rej('out-of-scope', { medium: (kv['技法・素材'] || '').slice(0, 30) }); tick(); return;
      }
      const year = toYear(kv['制作年']);
      if (isPreModernPhoto(category, year)) { stat.outOfScope++; rej('photo-pre-1920'); tick(); return; }

      const og = $('meta[property="og:image"]').attr('content') || '';
      if (!og || /noimage|no-photo/i.test(og)) { stat.noImage++; rej('no-image'); tick(); return; }
      // 테마 상대경로(.../themes/polamuseum/../../collection_images/x.jpg)를 정규화한다
      const src = new URL(og, url).href;

      const ir = await get(src);
      if (!ir) { stat.failed++; rej('image-fetch-failed'); tick(); return; }
      const buf = Buffer.from(await ir.arrayBuffer());

      const verdict = await judgeImage(buf, category);
      if (!verdict.ok) {
        if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
        rej(verdict.reason, { category }); tick(); return;
      }

      const key = `${PREFIX}/${MUSEUM.id}-${id}-${sha8(src)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));

      done.set(id, {
        key, category, src, year, url,
        title, titleJa,
        desc: $('.collection_text').first().text().trim().replace(/\s+/g, ' ').slice(0, 1200),
        artist: en['Artist'] || kv['作家名'] || 'Unknown',
        artistJa: kv['作家名'] || '',
        date: en['Date'] || kv['制作年'] || '',
        medium: en['Material and technique'] || kv['技法・素材'] || kv['技法／素材'] || '',
        dimensions: en['Measurements'] || kv['サイズ'] || kv['寸法'] || '',
      });
      stat.kept++;
    } catch (e) { stat.failed++; rej('error: ' + e.message); }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[pola] 완료 — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${MUSEUM.id}-${id}`,
      objectNumber: id,
      title: r.title, artist: r.artist,
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: r.dimensions || '',
      category: r.category, description: r.desc || '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: false, displayLocation: '',
      sourceUrl: r.url,
      metadata: {
        ...(r.titleJa && r.titleJa !== r.title ? { title_ja: r.titleJa } : {}),
        ...(r.artistJa && r.artistJa !== r.artist ? { artist_ja: r.artistJa } : {}),
      },
      original_imageUrl: r.src,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: MUSEUM.name, museum_ko: MUSEUM.name_ko, collection: 'Collection',
      website: MUSEUM.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'html', artworks,
    }, null, 2));
    console.log(`[pola] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[pola] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
