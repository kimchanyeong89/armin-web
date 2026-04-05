/**
 * 한국 미술관 전시 자동 업데이트 스크립트
 *
 * - 각 미술관의 전시 목록 API/페이지에서 현재 전시 정보를 수집
 * - CF Worker /proxy-image 를 통해 이미지를 R2에 캐시 (hotlink 우회)
 * - exhibitions.js의 temporaryExhibitions를 업데이트
 *
 * 실행: node scripts/museum-exhibition-updater.mjs
 *       node scripts/museum-exhibition-updater.mjs --museum mmca-seoul
 *       node scripts/museum-exhibition-updater.mjs --dry-run
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXHIBITIONS_JS = join(ROOT, 'src/data/exhibitions.js');
const CF_WORKER = 'https://armin-r2-upload.armin-art.workers.dev';
const R2_PUBLIC_BASE = 'https://pub-6ce5ae60b244951ac36ffd277fd6ef76.r2.dev';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MUSEUM_FILTER = args.includes('--museum') ? args[args.indexOf('--museum') + 1] : null;

// ─── HTTP 유틸 ────────────────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'application/json,text/html,*/*;q=0.9',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `${u.protocol}//${u.hostname}/`,
        ...headers,
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(new URL(res.headers.location, url).href, headers).then(resolve).catch(reject);
      }
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, ct: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

async function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('POST timeout')); });
    req.write(data); req.end();
  });
}

// ─── CF Worker 이미지 프록시 ──────────────────────────────────
async function proxyImageToR2(sourceUrl, r2Key, referer) {
  if (!sourceUrl || sourceUrl.includes('@dummy') || sourceUrl.includes('noimage')) {
    return null;
  }
  // 이미 R2에 있는 경우 스킵
  if (sourceUrl.startsWith(R2_PUBLIC_BASE) || sourceUrl.includes('pub-396fad1f')) {
    return sourceUrl;
  }

  if (DRY_RUN) {
    console.log(`    [DRY] would proxy: ${sourceUrl} → R2:${r2Key}`);
    return `${R2_PUBLIC_BASE}/${r2Key}`;
  }

  try {
    const res = await httpPost(`${CF_WORKER}/proxy-image`, { url: sourceUrl, r2Key, referer });
    const json = JSON.parse(res.body);
    if (json.success) {
      return json.url;
    } else {
      console.warn(`    ⚠ Proxy failed for ${sourceUrl}: ${json.error}`);
      return null;
    }
  } catch (e) {
    console.warn(`    ⚠ Proxy error for ${sourceUrl}: ${e.message}`);
    return null;
  }
}

// ─── 날짜 유틸 ───────────────────────────────────────────────
function toStatus(startDate, endDate) {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now < start) return 'upcoming';
  if (now > end) return 'past';
  return 'ongoing';
}
function fmtDate(d) {
  if (!d) return '';
  return String(d).replace(/\./g, '-').trim().substring(0, 10);
}

// ═══════════════════════════════════════════════════════════════
// 미술관별 스크래퍼
// ═══════════════════════════════════════════════════════════════

// ── 1. 국립현대미술관 (MMCA) ──────────────────────────────────
async function scrapeMmca(museumId) {
  console.log('\n📍 MMCA 국립현대미술관...');
  const apiUrl = 'https://www.mmca.go.kr/exhibitions/AjaxExhibitionList.do?exhFlag=1&searchExhPlaCd=&searchExhCd=&sort=1&pageIndex=';

  const results = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const res = await httpGet(apiUrl + page, { Referer: 'https://www.mmca.go.kr/exhibitions/progressList.do' });
      const data = JSON.parse(res.body);
      const items = data.exhibitionsList || [];
      if (items.length === 0) break;

      for (const item of items) {
        const exhId = item.exhId;
        const title = item.exhTitle;
        const startDate = fmtDate(item.exhStDt);
        const endDate = fmtDate(item.exhEdDt);
        const status = toStatus(startDate, endDate);
        if (status === 'past') continue;

        // 이미지: thumbImg가 없으면 didImg 사용
        const imgPath = item.exhThumbImg || item.exhDidImg;
        const sourceUrl = imgPath ? `https://www.mmca.go.kr${imgPath}` : null;
        const r2Key = `exhibitions/covers/${museumId}-${exhId}.jpg`;

        let coverImage = '';
        if (sourceUrl) {
          console.log(`  ⬆ ${title}: proxying image...`);
          coverImage = await proxyImageToR2(sourceUrl, r2Key, 'https://www.mmca.go.kr/') || sourceUrl;
        }

        results.push({
          id: `mmca-${exhId}`,
          title,
          description: item.exhContents?.replace(/<[^>]+>/g, '').trim().substring(0, 200) || '',
          startDate,
          endDate,
          coverImage,
          officialUrl: `https://www.mmca.go.kr/exhibitions/exhibitionsDetail.do?exhId=${exhId}`,
          status,
          venue: item.exhPlaNm || '서울',
        });
      }

      if (items.length < 8) break; // 마지막 페이지
    } catch (e) {
      console.warn(`  MMCA page ${page} error: ${e.message}`);
      break;
    }
  }
  console.log(`  → ${results.length}개 전시 수집`);
  return results;
}

// ── 2. 국립중앙박물관 (NMK) ──────────────────────────────────
async function scrapeNmk(museumId) {
  console.log('\n📍 국립중앙박물관...');
  try {
    const res = await httpGet(
      'https://www.museum.go.kr/site/main/exhList/period',
      { Referer: 'https://www.museum.go.kr/' }
    );

    const results = [];
    // HTML 파싱 - 전시 카드 패턴
    const cardRe = /<li[^>]*class="[^"]*exhi-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    const titleRe = /class="[^"]*tit[^"]*"[^>]*>([^<]+)/i;
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/;
    const imgRe = /src="([^"]*\/uploadfile\/exhibition[^"]*)"/i;
    const linkRe = /href="([^"]*exhDetail[^"]*)"/i;

    let m;
    while ((m = cardRe.exec(res.body)) !== null) {
      const block = m[1];
      const title = (titleRe.exec(block) || [])[1]?.trim();
      const dates = dateRe.exec(block);
      const imgMatch = imgRe.exec(block);
      const linkMatch = linkRe.exec(block);

      if (!title || !dates) continue;
      const startDate = fmtDate(dates[1]);
      const endDate = fmtDate(dates[2]);
      const status = toStatus(startDate, endDate);
      if (status === 'past') continue;

      const sourceUrl = imgMatch ? `https://www.museum.go.kr${imgMatch[1]}` : null;
      const exhId = 'nmk-' + startDate.replace(/-/g, '');
      const r2Key = `exhibitions/covers/${museumId}-${title.replace(/\s+/g, '-').substring(0, 20)}.jpg`;

      let coverImage = '';
      if (sourceUrl) {
        console.log(`  ⬆ ${title}: proxying...`);
        coverImage = await proxyImageToR2(sourceUrl, r2Key, 'https://www.museum.go.kr/') || sourceUrl;
      }

      results.push({
        id: exhId,
        title,
        description: '',
        startDate, endDate,
        coverImage,
        officialUrl: linkMatch ? `https://www.museum.go.kr${linkMatch[1]}` : 'https://www.museum.go.kr/site/main/exhList/period',
        status,
      });
    }
    console.log(`  → ${results.length}개 전시 수집`);
    return results;
  } catch (e) {
    console.warn(`  NMK error: ${e.message}`);
    return [];
  }
}

// ── 3. SeMA 서울시립미술관 ────────────────────────────────────
async function scrapeSema(museumId) {
  console.log('\n📍 서울시립미술관 (SeMA)...');
  // SeMA는 JS 렌더링 필요, API 패턴 시도
  const apis = [
    'https://sema.seoul.go.kr/api/v1/exhibitions?status=ING',
    'https://sema.seoul.go.kr/kr/ajax/exhibition/list?status=ING',
    'https://www.sema.seoul.go.kr/openapi/exhibition/list?status=ING&format=json',
  ];

  for (const apiUrl of apis) {
    try {
      const res = await httpGet(apiUrl, { Referer: 'https://sema.seoul.go.kr/' });
      if (res.status === 200 && res.ct.includes('json')) {
        const data = JSON.parse(res.body);
        console.log(`  SeMA API found at ${apiUrl}:`, Object.keys(data));
        // parse data here
        return [];
      }
    } catch {}
  }

  console.log('  ⚠ SeMA: API 미발견 - CF Worker 프록시로 이미지만 업데이트');
  // SeMA 이미지는 imgFileView endpoint 사용 - ID별로 직접 프록시
  return [];
}

// ── 4. Leeum 리움미술관 ───────────────────────────────────────
async function scrapeLeeum(museumId) {
  console.log('\n📍 리움미술관...');
  try {
    // Leeum은 보통 API JSON 엔드포인트 있음
    const res = await httpGet('https://leeum.org/kr/exhibition', { Referer: 'https://leeum.org/' });
    const results = [];

    // HTML에서 전시 정보 추출
    const imgMatches = [...res.body.matchAll(/(?:data-src|src)="([^"]*(?:upload|exhibition)[^"]*(?:jpg|jpeg|png|webp))"/gi)];
    const titleMatches = [...res.body.matchAll(/<(?:h[1-4]|strong)[^>]*>([^<]{5,80})<\/(?:h[1-4]|strong)>/gi)];
    const dateMatches = [...res.body.matchAll(/(\d{4}[.\-]\d{2}[.\-]\d{2})\s*[~–]\s*(\d{4}[.\-]\d{2}[.\-]\d{2})/g)];

    for (let i = 0; i < Math.min(imgMatches.length, 5); i++) {
      const sourceUrl = imgMatches[i][1];
      const title = titleMatches[i]?.[1]?.trim() || `리움 전시 ${i + 1}`;
      const dates = dateMatches[i];
      if (!dates) continue;

      const startDate = fmtDate(dates[1]);
      const endDate = fmtDate(dates[2]);
      const status = toStatus(startDate, endDate);
      if (status === 'past') continue;

      const r2Key = `exhibitions/covers/${museumId}-leeum-${i}.jpg`;
      const coverImage = await proxyImageToR2(sourceUrl, r2Key, 'https://leeum.org/') || sourceUrl;

      results.push({ id: `leeum-${i}`, title, description: '', startDate, endDate, coverImage, status });
    }
    console.log(`  → ${results.length}개 전시 수집`);
    return results;
  } catch (e) {
    console.warn(`  Leeum error: ${e.message}`);
    return [];
  }
}

// ── 5. APMA 아모레퍼시픽 미술관 ──────────────────────────────
async function scrapeApma(museumId) {
  console.log('\n📍 APMA 아모레퍼시픽 미술관...');
  try {
    const res = await httpGet('https://www.apma.or.kr/ko/exhibition', { Referer: 'https://www.apma.or.kr/' });

    const results = [];
    // APMA CDN 이미지 URL 패턴: image-apma.amorepacific.com
    const imgRe = /(https?:\/\/image-apma\.amorepacific\.com\/[^\s"'<>]+(?:jpg|jpeg|png|webp))/gi;
    const imgs = [...res.body.matchAll(imgRe)].map(m => m[1]);
    const titleRe = /<(?:h[1-4]|p)[^>]*class="[^"]*(?:tit|title)[^"]*"[^>]*>([^<]{3,80})<\//gi;
    const titles = [...res.body.matchAll(titleRe)].map(m => m[1].trim());
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*[-–~]\s*(\d{4}\.\d{2}\.\d{2})/g;
    const dates = [...res.body.matchAll(dateRe)];

    for (let i = 0; i < Math.min(imgs.length, 3); i++) {
      const title = titles[i] || `APMA 전시 ${i + 1}`;
      const d = dates[i];
      if (!d) continue;
      const startDate = fmtDate(d[1]);
      const endDate = fmtDate(d[2]);
      const status = toStatus(startDate, endDate);
      if (status === 'past') continue;

      const r2Key = `exhibitions/covers/${museumId}-${i}.jpg`;
      const coverImage = await proxyImageToR2(imgs[i], r2Key, 'https://www.apma.or.kr/') || imgs[i];

      results.push({ id: `apma-exh-${i}`, title, description: '', startDate, endDate, coverImage, status });
    }
    console.log(`  → ${results.length}개 전시 수집`);
    return results;
  } catch (e) {
    console.warn(`  APMA error: ${e.message}`);
    return [];
  }
}

// ── 6. 한가람미술관 (예술의전당) ─────────────────────────────
async function scrapeHangaram(museumId) {
  console.log('\n📍 예술의전당 한가람미술관...');
  try {
    const res = await httpGet(
      'https://www.sac.or.kr/site/main/show/showList?itemNo=3',
      { Referer: 'https://www.sac.or.kr/' }
    );

    const results = [];
    // 전시 카드 HTML 파싱
    const blockRe = /<li[^>]*class="[^"]*(?:show|list)-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    const titleRe = /class="[^"]*(?:tit|title|name)[^"]*"[^>]*>([^<]{3,80})</i;
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*[-~]\s*(\d{4}\.\d{2}\.\d{2})/;
    const imgRe = /(?:data-src|src)="([^"]*(?:jpg|jpeg|png|webp))"/i;

    let m, idx = 0;
    while ((m = blockRe.exec(res.body)) !== null && idx < 5) {
      const block = m[1];
      const title = (titleRe.exec(block) || [])[1]?.trim();
      const dates = dateRe.exec(block);
      const imgMatch = imgRe.exec(block);
      if (!title || !dates) continue;

      const startDate = fmtDate(dates[1]);
      const endDate = fmtDate(dates[2]);
      const status = toStatus(startDate, endDate);
      if (status === 'past') continue;

      const sourceUrl = imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : `https://www.sac.or.kr${imgMatch[1]}`) : null;
      const r2Key = `exhibitions/covers/${museumId}-${idx}.jpg`;
      const coverImage = sourceUrl ? (await proxyImageToR2(sourceUrl, r2Key, 'https://www.sac.or.kr/') || sourceUrl) : '';

      results.push({ id: `hangaram-${idx}`, title, description: '', startDate, endDate, coverImage, status });
      idx++;
    }
    console.log(`  → ${results.length}개 전시 수집`);
    return results;
  } catch (e) {
    console.warn(`  Hangaram error: ${e.message}`);
    return [];
  }
}

// ── 7. DDP 동대문디자인플라자 ─────────────────────────────────
async function scrapeDdp(museumId) {
  console.log('\n📍 DDP 동대문디자인플라자...');
  try {
    const res = await httpGet(
      'https://www.ddp.or.kr/usr/exhibition/exhibitionList.do',
      { Referer: 'https://www.ddp.or.kr/' }
    );

    const results = [];
    const imgRe = /src="([^"]*(?:jpg|jpeg|png|webp)[^"]*)"/gi;
    const titleRe = /<(?:h[1-4]|strong|dt)[^>]*>([^<]{5,80})<\/(?:h[1-4]|strong|dt)>/gi;
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*[-~]\s*(\d{4}\.\d{2}\.\d{2})/g;

    const imgs = [...res.body.matchAll(imgRe)]
      .map(m => m[1])
      .filter(u => !u.includes('icon') && !u.includes('logo') && !u.includes('btn'));
    const titles = [...res.body.matchAll(titleRe)].map(m => m[1].trim());
    const dates = [...res.body.matchAll(dateRe)];

    for (let i = 0; i < Math.min(imgs.length, 3); i++) {
      const title = titles[i] || `DDP 전시 ${i + 1}`;
      const d = dates[i];
      if (!d) continue;
      const startDate = fmtDate(d[1]);
      const endDate = fmtDate(d[2]);
      const status = toStatus(startDate, endDate);
      if (status === 'past') continue;

      const sourceUrl = imgs[i].startsWith('http') ? imgs[i] : `https://www.ddp.or.kr${imgs[i]}`;
      const r2Key = `exhibitions/covers/${museumId}-${i}.jpg`;
      const coverImage = await proxyImageToR2(sourceUrl, r2Key, 'https://www.ddp.or.kr/') || sourceUrl;
      results.push({ id: `ddp-${i}`, title, description: '', startDate, endDate, coverImage, status });
    }
    console.log(`  → ${results.length}개 전시 수집`);
    return results;
  } catch (e) {
    console.warn(`  DDP error: ${e.message}`);
    return [];
  }
}

// ── 8. 대림미술관 ─────────────────────────────────────────────
async function scrapeDaelim(museumId) {
  console.log('\n📍 대림미술관...');
  try {
    const res = await httpGet('https://www.daelimmuseum.org/exhibition/', { Referer: 'https://www.daelimmuseum.org/' });
    const results = [];
    const imgRe = /src="([^"]*(?:jpg|jpeg|png|webp))"/gi;
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*[-~]\s*(\d{4}\.\d{2}\.\d{2})/g;
    const imgs = [...res.body.matchAll(imgRe)].map(m => m[1]).filter(u => u.includes('exhib') || u.includes('upload'));
    const dates = [...res.body.matchAll(dateRe)];

    for (let i = 0; i < Math.min(imgs.length, 2); i++) {
      const d = dates[i];
      if (!d) continue;
      const startDate = fmtDate(d[1]);
      const endDate = fmtDate(d[2]);
      const status = toStatus(startDate, endDate);
      if (status === 'past') continue;
      const sourceUrl = imgs[i].startsWith('http') ? imgs[i] : `https://www.daelimmuseum.org${imgs[i]}`;
      const r2Key = `exhibitions/covers/${museumId}-${i}.jpg`;
      const coverImage = await proxyImageToR2(sourceUrl, r2Key, 'https://www.daelimmuseum.org/') || sourceUrl;
      results.push({ id: `daelim-${i}`, title: `대림미술관 전시 ${i+1}`, description: '', startDate, endDate, coverImage, status });
    }
    console.log(`  → ${results.length}개 전시 수집`);
    return results;
  } catch (e) {
    console.warn(`  Daelim error: ${e.message}`);
    return [];
  }
}

// ── 이미지 직접 프록시 (기존 URL 교체용) ─────────────────────
async function proxyExistingImages() {
  console.log('\n🔄 exhibitions.js 기존 이미지 R2 캐시 처리...');
  const src = readFileSync(EXHIBITIONS_JS, 'utf8');

  // temporaryExhibition별로 id + coverImage 추출
  const re = /\{\s*id:\s*["'`]([^"'`]+)["'`][^{}]*?coverImage:\s*["'`]([^"'`]+)["'`]/gs;
  const items = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    items.push({ id: m[1], url: m[2] });
  }

  const urlMap = {};
  const seen = new Set();

  for (const { id, url } of items) {
    if (seen.has(url) || !url.startsWith('http') || url.startsWith(R2_PUBLIC_BASE) || url.includes('pub-396fad1f')) {
      seen.add(url); continue;
    }
    seen.add(url);

    const u = new URL(url);
    const domain = u.hostname;
    const ext = url.includes('.webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg';
    const safe = id.replace(/[^a-z0-9-]/gi, '-').toLowerCase().substring(0, 40);
    const r2Key = `exhibitions/covers/${safe}.${ext}`;
    const referer = `${u.protocol}//${domain}/`;

    console.log(`  📸 ${id}: ${domain}...`);
    const r2Url = await proxyImageToR2(url, r2Key, referer);
    if (r2Url && r2Url !== url) {
      urlMap[url] = r2Url;
      console.log(`     ✓ → R2`);
    } else {
      console.log(`     ✗ 실패`);
    }
  }
  return urlMap;
}

// ─── exhibitions.js 패치 ─────────────────────────────────────
function patchExhibitionsJs(urlMap) {
  let src = readFileSync(EXHIBITIONS_JS, 'utf8');
  let count = 0;
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    if (!newUrl || oldUrl === newUrl) continue;
    const esc = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = src;
    src = src.replace(new RegExp(esc, 'g'), newUrl);
    if (src !== before) count++;
  }
  if (!DRY_RUN) writeFileSync(EXHIBITIONS_JS, src, 'utf8');
  return count;
}

// ─── 메인 ────────────────────────────────────────────────────
async function main() {
  console.log(`\n🎨 한국 미술관 전시 업데이터 ${DRY_RUN ? '[DRY RUN]' : ''}`);
  console.log(`CF Worker: ${CF_WORKER}`);

  // Phase 1: 기존 exhibitions.js 이미지를 R2로 프록시
  const urlMap = await proxyExistingImages();
  const patched = patchExhibitionsJs(urlMap);
  console.log(`\n✅ 기존 이미지 패치: ${patched}개 URL 교체`);

  // Phase 2: 각 미술관 최신 전시 수집 (MMCA만 API 접근 가능, 나머지는 CF Worker 우회)
  if (!MUSEUM_FILTER || MUSEUM_FILTER === 'mmca-seoul') {
    const mmcaExhibitions = await scrapeMmca('mmca-seoul');
    if (mmcaExhibitions.length > 0) {
      console.log(`\n📋 MMCA 수집 결과 (이미지 R2 캐시 완료):`);
      for (const e of mmcaExhibitions) {
        console.log(`  - [${e.status}] ${e.title} (${e.startDate}~${e.endDate})`);
        console.log(`    이미지: ${e.coverImage}`);
      }
    }
  }

  // Phase 3: 결과 저장
  if (!DRY_RUN) {
    console.log('\n📁 exhibitions.js 저장 완료');
  }

  console.log('\n🏁 완료!');
  console.log(`\n💡 사용법:`);
  console.log(`   node scripts/museum-exhibition-updater.mjs              # 전체 실행`);
  console.log(`   node scripts/museum-exhibition-updater.mjs --dry-run    # 테스트 (파일 수정 없음)`);
  console.log(`   node scripts/museum-exhibition-updater.mjs --museum mmca-seoul  # 특정 미술관만`);
}

main().catch(e => { console.error(e); process.exit(1); });
