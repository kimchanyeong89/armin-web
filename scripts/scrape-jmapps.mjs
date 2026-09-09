// JMAPPS (I.B.MUSEUM SaaS) 범용 수집기.
//
// 일본 미술관 다수가 이 플랫폼을 공유한다. 앱의 金沢21世紀(scrape-kanazawa.cjs)가 같은 소스였고,
// 이 스크립트는 그 구조를 슬러그 파라미터로 일반화한 것이다.
//
//   node scripts/scrape-jmapps.mjs momak --limit 40    # 파일럿
//   node scripts/scrape-jmapps.mjs momak               # 전체
//   node scripts/scrape-jmapps.mjs momak --resume
//
// 수집 규칙 (COLLECTION_SCRAPING_GUIDE.md):
//   - 이미지 없는 레코드는 수집하지 않는다
//   - 평면 시각예술만 (조각·공예·설치 제외)
//   - 흑백 복제판화 제외 (드로잉은 흑백이어도 유지)
//   - 상세페이지에서 모든 필드를 파싱한다 (리스트 캡션 shortcut 금지)

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

// ── 대상 미술관 ────────────────────────────────────────────────────────────
// 표본 30건을 실제로 내려받아 긴 변을 잰 결과(2026-09-08). URL 존재 여부만으로는
// 판단할 수 없다 — momak 은 media_files URL 이 100% 있지만 전부 180px 썸네일이었다.
export const MUSEUMS = {
  faam:   { slug: 'faam',   id: 'faam-fukuoka', name: 'Fukuoka Asian Art Museum', name_ko: '후쿠오카 아시아미술관',
            site: 'https://faam.city.fukuoka.lg.jp/', lat: 33.5966, lng: 130.4103, city: 'Fukuoka',
            usable: '100% · 중앙 1200px · 총 5,718' },
  apmoa:  { slug: 'apmoa',  id: 'aichi-pmoa',   name: 'Aichi Prefectural Museum of Art', name_ko: '아이치현미술관',
            site: 'https://www-art.aac.pref.aichi.jp/', lat: 35.1729, lng: 136.9098, city: 'Nagoya',
            usable: '43% · 중앙 1200px · 총 11,356' },
  momas:  { slug: 'momas',  id: 'momas-saitama',name: 'The Museum of Modern Art, Saitama', name_ko: '사이타마현립근대미술관',
            site: 'https://pref.spec.ed.jp/momas/', lat: 35.9077, lng: 139.6480, city: 'Saitama',
            usable: '57% · 중앙 1200px · 총 4,376' },
  mimoca: { slug: 'mimoca', id: 'mimoca',       name: 'Marugame Genichiro-Inokuma Museum of Contemporary Art', name_ko: '마루가메시 이노쿠마 겐이치로 현대미술관',
            site: 'https://www.mimoca.org/', lat: 34.2894, lng: 133.7986, city: 'Marugame',
            usable: '100% · 중앙 1200px · 총 1,149' },
};

// 수집 불가로 판정된 JMAPPS 관 — 재조사 낭비를 막기 위해 근거를 남긴다.
export const NOT_VIABLE = {
  momak: '京都国立近代美術館 (16,861건) — 공개 이미지가 전부 180px 썸네일. 표본 30/30 저해상.',
  oam:   '青梅市立美術館 (2,342건) — og:image 파일명이 비어 실제 이미지가 없음. 표본 30/30 이미지 없음.',
  kmma:  '北九州市立美術館 (848건) — 이미지 보유 4%.',
  tobikan:'東京都美術館 (400건) — 컬렉션이 조각·서예다. 中分類 표본이 彫刻뿐. 앱에 이미 48점 항목이 있고 그게 상한.',
  okazaki:'岡崎市美術博物館 (242건) — 이미지 없음 102·스코프밖 119 로 실수집 21건.',
};

// ── 필드 어휘 (관마다 라벨이 다르다) ───────────────────────────────────────
const F = {
  titleEn:  ['Title', '題名 (英)', '題名（英）'],
  artist:   ['作家', '作家名', '制作者', '作者'],
  artistEn: ['Artist', '作家名（英）', '作家名（英語）'],
  year:     ['制作年', 'Year', '制作年（西暦）'],
  medium:   ['材質', '技法、素材', '技法・素材', '技法・材質', '素材/技法', '技法', 'Medium'],
  dims:     ['寸法', 'イメージ寸 (cm)', 'サイズ（高×幅×奥行）', '大きさ'],
  dimsH:    ['寸法縦（cm）', '寸法　縦(cm)'],
  dimsW:    ['寸法横（cm）', '寸法　横(cm)'],
  category: ['種別', '分野', '大分類'],
  objNo:    ['作品番号', '所蔵作品登録番号', '管理番号'],
  desc:     ['解説', '作品解説'],
  country:  ['国名'],
};

// ── 카테고리 판정 ──────────────────────────────────────────────────────────
/** 種別/分野 라벨 → canonical. 스코프 밖이면 null, 판단 불가면 undefined. */
function categoryFromLabel(label) {
  const s = (label || '').trim();
  if (!s) return undefined;
  if (/彫刻|立体|オブジェ|インスタレーション|工芸|陶|磁|漆|染織|金工|ガラス|家具|人形|楽器|甲冑|刀/.test(s)) return null;
  if (/版画|グラフィック/.test(s)) return 'print';
  if (/写真/.test(s)) return 'photograph';
  if (/映像|ビデオ|フィルム|メディア/.test(s)) return 'video';
  if (/書$|書跡|書道/.test(s)) return 'calligraphy';
  if (/素描|デッサン|ドローイング|水彩/.test(s)) return 'drawing';
  if (/日本画|洋画|絵画|油彩|水墨/.test(s)) return 'painting';
  return undefined;
}

/** 技法・素材 텍스트 → canonical. 라벨이 없을 때의 보조 판정. */
function categoryFromMedium(medium) {
  const s = (medium || '').trim();
  if (!s) return undefined;
  if (/ブロンズ|大理石|石膏|木彫|鋳造|陶器|磁器|漆|ガラス|テラコッタ|鉄|真鍮|セラミック/.test(s)) return null;
  if (/リトグラフ|石版|木版|銅版|エッチング|シルクスクリーン|ドライポイント|アクアチント|セリグラフ|版画|孔版|凹版|凸版/.test(s)) return 'print';
  if (/写真|ゼラチン|シルバー|プリント|印画紙|発色現像/.test(s)) return 'photograph';
  if (/映像|ビデオ|フィルム|DVD/.test(s)) return 'video';
  if (/鉛筆|木炭|コンテ|パステル|ペン|インク|素描|チョーク|クレヨン/.test(s)) return 'drawing';
  if (/油彩|油絵|水彩|アクリル|テンペラ|岩絵具|絹本|紙本|着色|膠彩|グアッシュ|水墨/.test(s)) return 'painting';
  if (/カンヴァス|キャンバス|画布|板|紙/.test(s)) return 'painting';
  return undefined;
}

// ── HTML 파싱 ──────────────────────────────────────────────────────────────
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36' };

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}

/** 상세페이지의 th/td 를 전부 딕셔너리로. (가이드 §3 상세페이지 전수 파싱) */
function parseDetail(html) {
  const $ = cheerio.load(html);
  const kv = {};
  $('th').each((_, el) => {
    const k = $(el).text().trim();
    const v = $(el).next('td').text().trim().replace(/\s+/g, ' ');
    if (k && v) kv[k] = v;
  });
  // 일본어 제목은 <title> 의 ［ID:n］ 제목 ： 작품정보 패턴에만 있다
  const titleJa = ($('title').text().match(/］\s*([^：]+?)\s*：/) || [])[1] || '';
  // ⚠️ 이미지가 없는 레코드도 og:image 를 내보내는데, 파일명이 비어 ".../large/.jpg" 형태다.
  // 이걸 유효한 URL 로 통과시키면 다운로드 400 으로 떨어져 "실패"로 잘못 집계된다(愛知 3,959건).
  // 확장자 앞에 실제 파일명이 있어야 이미지로 인정한다.
  const raw = (html.match(/https:\/\/ibmuseum\.mapps\.ne\.jp\/files\/[^"'\s]+?media_files\/large\/[^"'\s?]+/) || [])[0] || '';
  const img = /\/large\/[^/]+\.[a-z]+$/i.test(raw) ? raw : '';
  return { kv, titleJa: titleJa.trim(), img };
}

const pick = (kv, keys) => { for (const k of keys) if (kv[k]) return kv[k]; return ''; };
const toYear = s => { const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? Number(m[1]) : null; };
const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

// ── 메인 ───────────────────────────────────────────────────────────────────
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const LIST_CONCURRENCY = 4;
const DETAIL_CONCURRENCY = 6;

async function main() {
  const slug = process.argv[2];
  const M = MUSEUMS[slug];
  if (!M) { console.error(`슬러그를 지정하세요: ${Object.keys(MUSEUMS).join(', ')}`); process.exit(1); }

  const args = process.argv.slice(3);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  const STATE = path.join(ROOT, 'scripts/.state');
  fs.mkdirSync(STATE, { recursive: true });
  const PROGRESS = path.join(STATE, `${M.id}-progress.json`);
  const REJECT = path.join(STATE, `${M.id}-rejected.ndjson`);
  const OUT = path.join(ROOT, `public/data/${M.id}-collection.json`);
  const PREFIX = `artworks/${M.id}-collection`;

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  const base = `https://jmapps.ne.jp/${M.slug}/`;

  // ── Phase 1: 목록에서 data_id 수집 ──────────────────────────────────────
  const first = await get(`${base}list.html?page=1&list_count=50`);
  if (!first) { console.error('목록 접근 실패'); process.exit(1); }
  const total = Number(((first.match(/で([0-9,]+)件/) || [])[1] || '0').replace(/,/g, ''));
  const pages = Math.ceil(total / 50);
  console.log(`[${M.id}] ${M.name_ko} — 전체 ${total.toLocaleString()}건 / ${pages}페이지`);

  const idsFile = path.join(STATE, `${M.id}-ids.json`);
  let ids;
  if (RESUME && fs.existsSync(idsFile)) {
    ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
    console.log(`[${M.id}] 저장된 ID ${ids.length}건 재사용`);
  } else {
    const set = new Set();
    const lim = pLimit(LIST_CONCURRENCY);
    let got = 0;
    await Promise.all(Array.from({ length: pages }, (_, i) => lim(async () => {
      const html = i === 0 ? first : await get(`${base}list.html?page=${i + 1}&list_count=50`);
      if (html) for (const m of html.matchAll(/href="\.\/det\.html\?data_id=(\d+)"/g)) set.add(m[1]);
      if (++got % 100 === 0) console.log(`[${M.id}] 목록 ${got}/${pages}페이지 — ID ${set.size}건`);
    })));
    ids = [...set];
    fs.writeFileSync(idsFile, JSON.stringify(ids));
    console.log(`[${M.id}] ID 수집 완료 ${ids.length}건`);
  }

  // ── Phase 2: 상세 + 이미지 ──────────────────────────────────────────────
  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))))
    : new Map();
  if (args.includes('--retry-failed')) {
    // 일시적 실패만 되돌린다. 스코프밖·흑백·저해상은 판정이 끝난 것이므로 유지.
    let r = 0;
    for (const [k, v] of done) if (v.skip && /fetch-failed|error:/.test(v.skip)) { done.delete(k); r++; }
    console.log(`[${M.id}] 일시적 실패 ${r}건 재시도 대상으로 복구`);
  }
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });
  const todo = ids.filter(id => !done.has(id)).slice(0, LIMIT);
  console.log(`[${M.id}] 이번 실행 ${todo.length}건 (완료 ${done.size}건)\n`);

  const stat = { kept: 0, noImage: 0, outOfScope: 0, grayscale: 0, small: 0, failed: 0 };
  const lim = pLimit(DETAIL_CONCURRENCY);
  let n = 0;

  await Promise.all(todo.map(id => lim(async () => {
    const rej = (reason, extra) => {
      rejects.write(JSON.stringify({ id, reason, ...extra }) + '\n');
      done.set(id, { skip: reason });
    };
    // 거부 분기는 return 으로 빠져 아래 카운터를 지나치므로 여기서 함께 올린다.
    const tick = () => {
      if (++n % 200 === 0) {
        console.log(`[${M.id}] ${n}/${todo.length} — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 흑백판화 ${stat.grayscale} · 실패 ${stat.failed}`);
        fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
      }
    };
    try {
      const html = await get(`${base}det.html?data_id=${id}`);
      if (!html) { stat.failed++; rej('detail-fetch-failed'); tick(); return; }
      const { kv, titleJa, img } = parseDetail(html);

      // 이미지 필수 — 없으면 여기서 끝
      if (!img) { stat.noImage++; rej('no-image'); tick(); return; }

      const mediumTxt = pick(kv, F.medium);
      let category = categoryFromLabel(pick(kv, F.category));
      if (category === undefined) category = categoryFromMedium(mediumTxt);
      if (!category || !IN_SCOPE.has(category)) {
        stat.outOfScope++;
        rej('out-of-scope', { label: pick(kv, F.category), medium: mediumTxt.slice(0, 40) });
        tick(); return;
      }

      const year = toYear(pick(kv, F.year));
      if (isPreModernPhoto(category, year)) { stat.outOfScope++; rej('photo-pre-1920'); tick(); return; }

      // 재시도 없이 한 번 실패하면 작품이 영구 탈락한다. ColBase에서 같은 결함으로
      // 절반이 날아갔고, 하나씩 다시 부르면 200이 왔다. 404만 즉시 포기한다.
      const buf = await (async () => {
        for (let i = 0; i < 4; i++) {
          try {
            const r = await fetch(img, { headers: UA, signal: AbortSignal.timeout(60000) });
            if (r.ok) return Buffer.from(await r.arrayBuffer());
            if (r.status === 404) return null;
          } catch { /* 재시도 */ }
          await new Promise(res => setTimeout(res, 1200 * (i + 1)));
        }
        return null;
      })();
      if (!buf) { stat.failed++; rej('image-fetch-failed'); tick(); return; }

      const verdict = await judgeImage(buf, category);
      if (!verdict.ok) {
        if (verdict.reason.startsWith('grayscale')) stat.grayscale++; else stat.small++;
        rej(verdict.reason, { category });
        tick(); return;
      }

      const key = `${PREFIX}/${M.id}-${id}-${sha8(img)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));

      const h = pick(kv, F.dimsH), w = pick(kv, F.dimsW);
      // 작가는 소스가 주는 두 표기 중 로마자를 우선한다. 가타카나("キム・ファンギ")로는
      // 앱의 sorted-token 매칭이 "Kim Whanki"와 같은 작가로 묶지 못한다.
      const artistJa = pick(kv, F.artist), artistEn = pick(kv, F.artistEn);
      done.set(id, {
        key, category,
        title: titleJa || pick(kv, F.titleEn) || 'Untitled',
        titleEn: pick(kv, F.titleEn),
        artistJa,
        country: pick(kv, F.country),
        artist: artistEn || artistJa || 'Unknown',
        date: pick(kv, F.year),
        year,
        medium: mediumTxt,
        dimensions: pick(kv, F.dims) || (h && w ? `${h} × ${w} cm` : h || w || ''),
        objNo: pick(kv, F.objNo),
        desc: pick(kv, F.desc).slice(0, 1200),
        img,
      });
      stat.kept++;
    } catch (e) {
      stat.failed++; rej('error: ' + e.message);
    }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[${M.id}] 완료 — 수집 ${stat.kept} · 이미지없음 ${stat.noImage} · 스코프밖 ${stat.outOfScope} · 흑백판화 ${stat.grayscale} · 저해상 ${stat.small} · 실패 ${stat.failed}`);

  // ── Phase 3: canonical JSON ────────────────────────────────────────────
  const artworks = [];
  for (const [id, r] of done) {
    if (!r.key) continue;
    artworks.push({
      id: `${M.id}-${id}`,
      objectNumber: r.objNo || '',
      title: r.title,
      artist: r.artist,
      date: r.date || '',
      year: r.year,
      medium: r.medium || '',
      dimensions: r.dimensions || '',
      category: r.category,
      description: r.desc || '',
      imageUrl: `${PUBLIC_BASE}/${r.key}`,
      thumbnailUrl: '',
      onDisplay: false,
      displayLocation: '',
      sourceUrl: `${base}det.html?data_id=${id}`,
      metadata: {
        ...(r.titleEn && r.titleEn !== r.title ? { title_en: r.titleEn } : {}),
        ...(r.artistJa && r.artistJa !== r.artist ? { artist_ja: r.artistJa } : {}),
        ...(r.country ? { country: r.country } : {}),
      },
      original_imageUrl: r.img,
    });
  }

  if (LIMIT === Infinity) {
    fs.writeFileSync(OUT, JSON.stringify({
      museum: M.name, museum_ko: M.name_ko, collection: 'Collection',
      website: M.site, scraped_date: new Date().toISOString().slice(0, 10),
      total_count: artworks.length, source_type: 'html',
      artworks,
    }, null, 2));
    console.log(`[${M.id}] JSON 작성 — ${artworks.length}건 → public/data/${M.id}-collection.json`);
  } else {
    console.log(`[${M.id}] 파일럿이므로 JSON 미작성 (canonical 후보 ${artworks.length}건)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
