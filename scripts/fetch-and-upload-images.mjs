/**
 * 미술관 전시 이미지 다운로드 → R2 업로드 → exhibitions.js URL 교체
 *
 * 작동 방식:
 * 1. 각 미술관 API/HTML에서 실제 이미지 URL 수집
 * 2. 로컬에 이미지 다운로드 (Referer 헤더 포함)
 * 3. wrangler r2 object put으로 R2에 업로드
 * 4. exhibitions.js에서 coverImage URL 교체
 *
 * 실행: node scripts/fetch-and-upload-images.mjs
 */

import { execSync } from 'child_process';
import { createWriteStream, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXHIBITIONS_JS = join(ROOT, 'src/data/exhibitions.js');
const TMP = join(os.tmpdir(), 'armin-museum-imgs');
const BUCKET = 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-6ce5ae60b244951ac36ffd277fd6ef76.r2.dev';
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const NODE = '/Users/kietzsche/.nvm/versions/node/v22.22.2/bin/node';

if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

// ─── 이미지 다운로드 ──────────────────────────────────────────
function downloadImage(url, destPath, referer) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Referer': referer || `${u.protocol}//${u.hostname}/`,
        'Connection': 'keep-alive',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.hostname}${res.headers.location}`;
        return downloadImage(loc, destPath, referer).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const ct = res.headers['content-type'] || '';
      if (ct && !ct.includes('image') && !ct.includes('octet')) return reject(new Error(`Non-image: ${ct}`));
      const file = createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        try {
          if (statSync(destPath).size < 2048) return reject(new Error(`Too small (${statSync(destPath).size}B)`));
          resolve(ct);
        } catch (e) { reject(e); }
      });
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── R2 업로드 ────────────────────────────────────────────────
function uploadR2(localPath, r2Key, contentType) {
  const ct = contentType?.split(';')[0].trim() || 'image/jpeg';
  const cmd = `"${NODE}" "${WRANGLER}" r2 object put "${BUCKET}/${r2Key}" --file "${localPath}" --content-type "${ct}" --cache-control "public, max-age=31536000, immutable"`;
  execSync(cmd, { stdio: 'pipe' });
  return `${R2_PUBLIC}/${r2Key}`;
}

// ─── 미술관별 이미지 수집 ────────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124',
        'Accept': 'application/json,text/html,*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `${u.protocol}//${u.hostname}/`,
        ...headers
      }
    }, res => {
      if (res.statusCode >= 300 && res.headers.location) {
        return httpGet(new URL(res.headers.location, url).href, headers).then(resolve).catch(reject);
      }
      let d = ''; res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ s: res.statusCode, b: d, ct: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// MMCA AJAX API
async function getMmcaImages() {
  const items = [];
  for (let page = 1; page <= 3; page++) {
    const r = await httpGet(
      `https://www.mmca.go.kr/exhibitions/AjaxExhibitionList.do?exhFlag=1&searchExhPlaCd=&searchExhCd=&sort=1&pageIndex=${page}`,
      { Referer: 'https://www.mmca.go.kr/exhibitions/progressList.do' }
    );
    const data = JSON.parse(r.b);
    const list = (data.exhibitionsList || []);
    for (const e of list) {
      const imgPath = e.exhThumbImg || e.exhDidImg;
      if (!imgPath) continue;
      const ext = imgPath.endsWith('.gif') ? 'gif' : imgPath.endsWith('.png') ? 'png' : 'jpg';
      items.push({
        exhId: e.exhId,
        title: e.exhTitle,
        sourceUrl: `https://www.mmca.go.kr${imgPath}`,
        r2Key: `exhibitions/covers/mmca-${e.exhId}.${ext}`,
        referer: 'https://www.mmca.go.kr/',
        startDate: e.exhStDt,
        endDate: e.exhEdDt,
        venue: e.exhPlaNm,
      });
    }
    if (list.length < 8) break;
  }
  return items;
}

// NMK 국립중앙박물관 - 전시 HTML 파싱
async function getNmkImages() {
  try {
    const r = await httpGet('https://www.museum.go.kr/site/main/exhList/period');
    const items = [];
    const imgRe = /src="(\/uploadfile\/exhibition\/[^"]+\.(?:jpg|jpeg|png|gif))"/gi;
    const titleRe = /<p[^>]*class="[^"]*tit[^"]*"[^>]*>\s*([^<]{5,80})\s*<\/p>/gi;
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/g;
    const imgs = [...r.b.matchAll(imgRe)].map(m => m[1]);
    const titles = [...r.b.matchAll(titleRe)].map(m => m[1].trim());
    const dates = [...r.b.matchAll(dateRe)];
    for (let i = 0; i < Math.min(imgs.length, 5); i++) {
      const sourceUrl = `https://www.museum.go.kr${imgs[i]}`;
      const ext = imgs[i].split('.').pop();
      items.push({
        exhId: `nmk-${i}`,
        title: titles[i] || `국립중앙박물관 전시 ${i+1}`,
        sourceUrl,
        r2Key: `exhibitions/covers/nmk-exh-${i}.${ext}`,
        referer: 'https://www.museum.go.kr/',
        startDate: dates[i]?.[1]?.replace(/\./g,'-') || '',
        endDate: dates[i]?.[2]?.replace(/\./g,'-') || '',
      });
    }
    return items;
  } catch (e) { console.warn('NMK error:', e.message); return []; }
}

// DDP - HTML 파싱
async function getDdpImages() {
  try {
    const r = await httpGet('https://www.ddp.or.kr/usr/exhibition/exhibitionList.do?lang=K&cateCode=002');
    const items = [];
    const imgRe = /src="(\/upload[^"]+\.(?:jpg|jpeg|png|gif))"/gi;
    const imgs = [...r.b.matchAll(imgRe)].map(m => m[1]).filter(u => !u.includes('icon'));
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*[-~]\s*(\d{4}\.\d{2}\.\d{2})/g;
    const dates = [...r.b.matchAll(dateRe)];
    for (let i = 0; i < Math.min(imgs.length, 3); i++) {
      items.push({
        exhId: `ddp-${i}`,
        title: `DDP 전시 ${i+1}`,
        sourceUrl: `https://www.ddp.or.kr${imgs[i]}`,
        r2Key: `exhibitions/covers/ddp-exh-${i}.jpg`,
        referer: 'https://www.ddp.or.kr/',
        startDate: dates[i]?.[1]?.replace(/\./g,'-') || '',
        endDate: dates[i]?.[2]?.replace(/\./g,'-') || '',
      });
    }
    return items;
  } catch (e) { console.warn('DDP error:', e.message); return []; }
}

// 예술의전당 한가람
async function getHangaramImages() {
  try {
    const r = await httpGet('https://www.sac.or.kr/site/main/show/showList?itemNo=3');
    const items = [];
    const imgRe = /src="([^"]+\.(?:jpg|jpeg|png|gif))"/gi;
    const imgs = [...r.b.matchAll(imgRe)]
      .map(m => m[1])
      .filter(u => u.includes('show') || u.includes('upload') || u.includes('exhibit'));
    const dateRe = /(\d{4}\.\d{2}\.\d{2})\s*[-~]\s*(\d{4}\.\d{2}\.\d{2})/g;
    const dates = [...r.b.matchAll(dateRe)];
    for (let i = 0; i < Math.min(imgs.length, 3); i++) {
      const sourceUrl = imgs[i].startsWith('http') ? imgs[i] : `https://www.sac.or.kr${imgs[i]}`;
      items.push({
        exhId: `hangaram-${i}`,
        title: `한가람미술관 전시 ${i+1}`,
        sourceUrl,
        r2Key: `exhibitions/covers/hangaram-exh-${i}.jpg`,
        referer: 'https://www.sac.or.kr/',
        startDate: dates[i]?.[1]?.replace(/\./g,'-') || '',
        endDate: dates[i]?.[2]?.replace(/\./g,'-') || '',
      });
    }
    return items;
  } catch (e) { console.warn('Hangaram error:', e.message); return []; }
}

// ─── exhibitions.js 패치: coverImage URL 교체 ────────────────
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
  writeFileSync(EXHIBITIONS_JS, src, 'utf8');
  return count;
}

// ─── 단일 이미지 처리 ────────────────────────────────────────
async function processImage({ sourceUrl, r2Key, referer, title }) {
  const tmpPath = join(TMP, r2Key.replace(/\//g, '_'));
  const expectedR2Url = `${R2_PUBLIC}/${r2Key}`;

  process.stdout.write(`  📸 ${title?.substring(0, 25) || sourceUrl.split('/').pop()}`);

  // 이미 R2에 있으면 스킵 (head 체크 대신 URL 기반 스킵)
  if (sourceUrl.startsWith(R2_PUBLIC) || sourceUrl.includes('pub-396fad1f')) {
    console.log(' → 이미 R2');
    return { old: sourceUrl, new: sourceUrl };
  }

  try {
    process.stdout.write(' ⬇...');
    const ct = await downloadImage(sourceUrl, tmpPath, referer);
    process.stdout.write(' ⬆...');
    const r2Url = uploadR2(tmpPath, r2Key, ct);
    console.log(` ✓ ${r2Url}`);
    return { old: sourceUrl, new: r2Url };
  } catch (e) {
    console.log(` ✗ ${e.message}`);
    return { old: sourceUrl, new: null };
  }
}

// ─── 메인 ────────────────────────────────────────────────────
async function main() {
  console.log('\n🎨 미술관 이미지 R2 업로드 시작\n');
  const urlMap = {};

  // ── Phase 1: exhibitions.js의 기존 외부 URL들을 R2로 ────────
  console.log('═══ Phase 1: 기존 exhibitions.js 이미지 프록시 ═══');
  const src = readFileSync(EXHIBITIONS_JS, 'utf8');
  const exhRe = /\{\s*id:\s*["'`]([^"'`]+)["'`][^{}]*?coverImage:\s*["'`]([^"'`]+)["'`]/gs;
  const seen = new Set();
  let m;
  while ((m = exhRe.exec(src)) !== null) {
    const id = m[1], url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    if (!url.startsWith('http') || url.startsWith(R2_PUBLIC) || url.includes('pub-396fad1f')) continue;

    const u = new URL(url);
    const ext = url.includes('.webp') ? 'webp' : url.includes('.png') ? 'png' : url.includes('.gif') ? 'gif' : 'jpg';
    const safe = id.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 35);
    const result = await processImage({
      sourceUrl: url,
      r2Key: `exhibitions/covers/${safe}.${ext}`,
      referer: `${u.protocol}//${u.hostname}/`,
      title: id,
    });
    if (result.new) urlMap[result.old] = result.new;
  }

  // ── Phase 2: MMCA 최신 전시 이미지 수집 ─────────────────────
  console.log('\n═══ Phase 2: MMCA 최신 전시 이미지 ═══');
  try {
    const mmcaItems = await getMmcaImages();
    for (const item of mmcaItems) {
      const result = await processImage(item);
      if (result.new && result.new !== result.old) urlMap[result.old] = result.new;
    }
  } catch (e) { console.warn('MMCA Phase 2 error:', e.message); }

  // ── Phase 3: NMK ─────────────────────────────────────────────
  console.log('\n═══ Phase 3: 국립중앙박물관 이미지 ═══');
  try {
    const nmkItems = await getNmkImages();
    for (const item of nmkItems) {
      const result = await processImage(item);
      if (result.new && result.new !== result.old) urlMap[result.old] = result.new;
    }
  } catch (e) { console.warn('NMK Phase 3 error:', e.message); }

  // ── Phase 4: DDP ─────────────────────────────────────────────
  console.log('\n═══ Phase 4: DDP 이미지 ═══');
  try {
    const ddpItems = await getDdpImages();
    for (const item of ddpItems) {
      const result = await processImage(item);
      if (result.new && result.new !== result.old) urlMap[result.old] = result.new;
    }
  } catch (e) { console.warn('DDP error:', e.message); }

  // ── Phase 5: 예술의전당 ───────────────────────────────────────
  console.log('\n═══ Phase 5: 예술의전당 한가람 이미지 ═══');
  try {
    const hanItems = await getHangaramImages();
    for (const item of hanItems) {
      const result = await processImage(item);
      if (result.new && result.new !== result.old) urlMap[result.old] = result.new;
    }
  } catch (e) { console.warn('Hangaram error:', e.message); }

  // ── 패치 적용 ────────────────────────────────────────────────
  const successCount = Object.values(urlMap).filter(Boolean).length;
  console.log(`\n📝 exhibitions.js 패치 중... (${successCount}개 URL 교체)`);
  const patched = patchExhibitionsJs(urlMap);
  console.log(`✅ 완료: ${patched}개 URL 교체됨`);

  // 결과 요약
  console.log('\n📊 결과 요약:');
  for (const [old, newUrl] of Object.entries(urlMap)) {
    if (newUrl) {
      const domain = new URL(old).hostname;
      console.log(`  ✓ ${domain} → R2`);
    } else {
      console.log(`  ✗ ${old.substring(0, 60)} 실패`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
