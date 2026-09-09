// 千葉市美術館 (Chiba City Museum of Art) 수집기.
//
// 소스: www.ccma-net.jp — WordPress. 목록/검색 API 가 없어 작품 상세 URL
//   /collection/works/{id}/ 를 id 순회로 훑는다. 표본 40개 중 29개가 200 이라
//   id 공간(1..~13000)의 약 73% 가 유효하다. 없는 id 는 400 을 준다.
//
// 이미지: /collection_search/media_files/pict_large/{n}.jpg — 최대 2560px.
//   일본 국립미술관 계열이 155~260px 썸네일만 주는 것과 대조적으로 화질이 좋다.
//
//   node scripts/scrape-chiba.mjs --limit 30   # 파일럿
//   node scripts/scrape-chiba.mjs              # 전체

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
  id: 'chiba-city-art',
  name: 'Chiba City Museum of Art',
  name_ko: '지바시립미술관',
  site: 'https://www.ccma-net.jp/',
  lat: 35.6073, lng: 140.1233, city: 'Chiba',
};

const BASE = 'https://www.ccma-net.jp/collection/works/';
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36' };
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = `artworks/${MUSEUM.id}-collection`;
const MAX_ID = 13000;
const CONCURRENCY = 5;

/** 分類(浮世絵版画／近世版画, 日本画 …) → canonical. 스코프 밖이면 null. */
function toCategory(bunrui, medium) {
  const s = `${bunrui || ''} ${medium || ''}`;
  if (/彫刻|工芸|陶|磁|漆|染織|金工|ガラス|人形|家具/.test(s)) return null;
  if (/版画|錦絵|摺物|絵本|版本/.test(s)) return 'print';
  if (/写真/.test(s)) return 'photograph';
  if (/書/.test(s) && !/書物/.test(s)) return 'calligraphy';
  if (/素描|デッサン|ドローイング|下絵|粉本/.test(s)) return 'drawing';
  if (/日本画|洋画|絵画|肉筆|油彩|水彩|掛軸|屏風/.test(s)) return 'painting';
  return null;
}

/** "天保4年（1833）頃" · "1975年" → 서기 연도 */
function toYear(s) {
  const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (m) return Number(m[1]);
  const c = String(s || '').match(/(\d{1,2})世紀/);
  return c ? (Number(c[1]) - 1) * 100 : null;
}

/**
 * 작가명은 "葛飾 北斎 かつしか ほくさい KATSUSHIKA Hokusai ［1760-1849］" 처럼
 * 한자·가나·로마자·생몰년이 한 칸에 들어 있다. 앱의 작가 매칭이 붙도록 로마자만 뽑는다.
 */
function artistLatin(raw) {
  const s = String(raw || '').replace(/［[^］]*］|\[[^\]]*\]/g, '').trim();
  const runs = s.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ.'’\- ]*[A-Za-zÀ-ɏ.]/g);
  if (!runs) return null;
  const joined = runs.join(' ').replace(/\s+/g, ' ').trim();
  return joined.replace(/[^A-Za-zÀ-ɏ]/g, '').length >= 3 ? joined : null;
}

/** 일본 문자 뒤에 붙은 로마자 구간을 영문 제목으로 뽑는다. 없으면 null. */
function latinTail(s) {
  const t = String(s || '').trim();
  const m = t.match(/[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9 ,.'’()\-:;&#/]*$/);
  if (!m) return null;
  const tail = m[0].trim();
  return tail.replace(/[^A-Za-zÀ-ɏ]/g, '').length >= 3 ? tail : null;
}

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (r.ok) return r;
      if (r.status === 400 || r.status === 404) return null;   // 존재하지 않는 id
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 900 * (i + 1)));
  }
  return null;
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

  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  if (args.includes('--retry-failed')) {
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[chiba] 일시적 실패 ${r}건 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const todo = [];
  for (let i = 1; i <= MAX_ID && todo.length < LIMIT; i++) if (!done.has(String(i))) todo.push(i);
  console.log(`[chiba] ${MUSEUM.name_ko} — id 1..${MAX_ID} 순회 · 이번 실행 ${todo.length}건 (완료 ${done.size})\n`);

  const stat = { kept: 0, noPage: 0, noImage: 0, outOfScope: 0, grayscale: 0, small: 0, failed: 0 };
  const lim = pLimit(CONCURRENCY);
  let n = 0;
  const tick = () => {
    if (++n % 500 === 0) {
      console.log(`[chiba] ${n}/${todo.length} — 수집 ${stat.kept} · 없는id ${stat.noPage} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 실패 ${stat.failed}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
    }
  };

  await Promise.all(todo.map(num => lim(async () => {
    const id = String(num);
    const rej = (reason, extra) => { rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n'); done.set(id, { skip: reason }); };
    try {
      const res = await get(`${BASE}${num}/`);
      if (!res) { stat.noPage++; done.set(id, { skip: 'no-page' }); tick(); return; }
      const html = await res.text();
      const $ = cheerio.load(html);

      const kv = {};
      $('th').each((_, el) => {
        const k = $(el).text().trim();
        const v = $(el).next('td').text().trim().replace(/\s+/g, ' ');
        if (k && v) kv[k] = v;
      });

      const title = (kv['作品名'] || '').trim();
      const artistRaw = (kv['作家名'] || '').trim();
      if (!title) { rej('no-title'); tick(); return; }

      const category = toCategory(kv['分類'], kv['技法／材質']);
      if (!category || !IN_SCOPE.has(category)) {
        stat.outOfScope++; rej('out-of-scope', { bunrui: kv['分類'] || '', medium: (kv['技法／材質'] || '').slice(0, 30) }); tick(); return;
      }

      const year = toYear(kv['制作年']);
      if (isPreModernPhoto(category, year)) { stat.outOfScope++; rej('photo-pre-1920'); tick(); return; }

      const src = $('meta[property="og:image"]').attr('content')
        || $('img[src*="pict_large"]').first().attr('src') || '';
      if (!src || /logo|icon|noimage/i.test(src)) { stat.noImage++; rej('no-image'); tick(); return; }
      const abs = src.startsWith('http') ? src : new URL(src, `${BASE}${num}/`).href;

      const ir = await get(abs);
      if (!ir) { stat.failed++; rej('image-fetch-failed'); tick(); return; }
      const buf = Buffer.from(await ir.arrayBuffer());

      const verdict = await judgeImage(buf, category);
      if (!verdict.ok) {
        if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
        rej(verdict.reason, { category }); tick(); return;
      }

      const key = `${PREFIX}/${MUSEUM.id}-${id}-${sha8(abs)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));

      done.set(id, {
        key, category, src: abs, year,
        // 제목은 "한자 / 히라가나 / 영문" 이 한 칸에 붙어 있다
        // ("辰野清平（節梅）翁像 たつのせいべい… Portrait of Mr. Tatsuno Seibei").
        // 일본 문자가 끝난 뒤의 로마자 꼬리를 영문 제목으로 본다.
        title: latinTail(title) || title,
        titleJa: title,
        artist: artistLatin(artistRaw) || 'Unknown',
        artistJa: artistRaw,
        date: kv['制作年'] || '',
        medium: kv['技法／材質'] || '',
        dimensions: kv['寸法'] || '',
        objNo: kv['所蔵品番号'] || '',
        bunrui: kv['分類'] || '',
      });
      stat.kept++;
    } catch (e) { stat.failed++; rej('error: ' + e.message); }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[chiba] 완료 — 수집 ${stat.kept} · 없는id ${stat.noPage} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 흑백 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${MUSEUM.id}-${id}`,
      objectNumber: r.objNo || '',
      title: r.title, artist: r.artist,
      date: r.date || '', year: r.year,
      medium: r.medium || '', dimensions: r.dimensions || '',
      category: r.category, description: '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`, thumbnailUrl: '',
      onDisplay: false, displayLocation: '',
      sourceUrl: `${BASE}${id}/`,
      metadata: {
        ...(r.titleJa && r.titleJa !== r.title ? { title_ja: r.titleJa } : {}),
        ...(r.artistJa && r.artistJa !== r.artist ? { artist_ja: r.artistJa } : {}),
        ...(r.bunrui ? { bunrui: r.bunrui } : {}),
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
    console.log(`[chiba] JSON 작성 — ${artworks.length}건`);
  } else {
    console.log(`[chiba] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
