#!/usr/bin/env node
/**
 * sync-exhibitions.mjs
 *
 * 10개 한국 미술관 전시 데이터 + 이미지를 수집해
 * R2에 업로드하고 exhibitions.js를 업데이트한다.
 *
 * 실행: node scripts/sync-exhibitions.mjs [--museum mmca|nmk|ddp|...]
 *       node scripts/sync-exhibitions.mjs   (전체 실행)
 *
 * 각 미술관별 접근 방법:
 *   mmca       — progressList.do 페이지 파싱 (img src: upload/exhibition/...)
 *   nmk        — /MUSEUM/contents/M0202010000.do (afile/previewThumbnail/...)
 *   ddp        — /index.html?menuno=240 (usr/upload/board_thumb/...)
 *   leeum      — leeumhoam.org API JSON
 *   hoam       — leeumhoam.org API JSON
 *   apma       — image-apma.amorepacific.com CDN
 *   sema       — sema.seoul.go.kr/common/imgFileView
 *   sac        — sac.or.kr dataList API
 *   groundseesaw — groundseesaw.cafe24.com CDN
 *   bma        — art.busan.go.kr (same-origin, Chrome 필요)
 *   jmoa       — jeju.go.kr/jmoa/show/current.htm (HTML scraping)
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
const TMP_DIR = join(os.tmpdir(), 'armin-sync');
const BUCKET = 'armin-gallery-images';
const R2_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');
const WRANGLER_CONFIG = join(ROOT, 'workers/r2-upload/wrangler.toml');
const NODE_BIN = '/Users/kietzsche/.nvm/versions/node/v22.22.2/bin/node';

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

// ── 유틸: HTTP 다운로드 ──────────────────────────────────────────
function download(url, destPath, referer) {
  return new Promise((resolve, reject) => {
    const makeReq = (reqUrl, hops = 0) => {
      if (hops > 5) return reject(new Error('Too many redirects'));
      const u = new URL(reqUrl);
      const proto = u.protocol === 'https:' ? https : http;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      };
      if (referer) headers['Referer'] = referer;
      proto.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.hostname}${res.headers.location}`;
          res.resume(); return makeReq(next, hops + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`));
        const ct = res.headers['content-type'] || '';
        if (!ct.includes('image') && !ct.includes('octet-stream')) return reject(new Error(`Non-image: ${ct}`));
        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(ct); });
        file.on('error', reject);
      }).on('error', reject).setTimeout(20000, function() { this.destroy(); reject(new Error('Timeout')); });
    };
    makeReq(url);
  });
}

// ── 유틸: JSON fetch ─────────────────────────────────────────────
function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const proto = u.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      ...opts.headers,
    };
    proto.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on('error', reject).setTimeout(15000, function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

// ── 유틸: R2 업로드 ─────────────────────────────────────────────
function uploadToR2(localPath, r2Key, contentType = 'image/jpeg') {
  const ct = contentType.split(';')[0].trim();
  execSync(
    `"${NODE_BIN}" "${WRANGLER}" r2 object put "${BUCKET}/${r2Key}" --file "${localPath}" --content-type "${ct}" --cache-control "public, max-age=31536000" --remote -c "${WRANGLER_CONFIG}"`,
    { stdio: 'pipe', env: { ...process.env, PATH: `/Users/kietzsche/.nvm/versions/node/v22.22.2/bin:${process.env.PATH}` } }
  );
  return `${R2_BASE}/${r2Key}`;
}

// ── 유틸: R2에 이미 있는지 확인 ─────────────────────────────────
async function existsOnR2(r2Key) {
  return new Promise(resolve => {
    const u = new URL(`${R2_BASE}/${r2Key}`);
    https.get({ hostname: u.hostname, path: u.pathname, method: 'HEAD' }, res => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

// ── 유틸: 이미지 다운로드 → R2 업로드 (캐시 체크 포함) ──────────
async function ensureR2(srcUrl, r2Key, referer, force = false) {
  if (!force && await existsOnR2(r2Key)) {
    return { url: `${R2_BASE}/${r2Key}`, cached: true };
  }
  const ext = r2Key.split('.').pop();
  const tmpPath = join(TMP_DIR, r2Key.replace(/\//g, '_'));
  const ct = await download(srcUrl, tmpPath, referer);
  const size = statSync(tmpPath).size;
  if (size < 1024) throw new Error(`Too small: ${size}b`);
  const url = uploadToR2(tmpPath, r2Key, ct);
  return { url, size, cached: false };
}

// ════════════════════════════════════════════════════════════════
// 미술관별 스크래퍼
// ════════════════════════════════════════════════════════════════

// ── 1. MMCA (국립현대미술관) ─────────────────────────────────────
// URL: https://www.mmca.go.kr/exhibitions/progressList.do
// 이미지: https://www.mmca.go.kr/upload/exhibition/YYYY/MM/timestamp.ext
async function scrapeMmca() {
  console.log('\n📍 MMCA 스크래핑...');
  const res = await fetchJson(
    'https://www.mmca.go.kr/exhibitions/ajaxProgressList.do?cp=1',
    { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.mmca.go.kr/' } }
  );
  const results = [];
  const items = Array.isArray(res) ? res : (res.list || res.result || []);
  for (const item of items.slice(0, 20)) {
    const id = item.exhId || item.EXHBT_ID || '';
    const title = item.exhNm || item.EXHBT_NM || '';
    const imgPath = item.listImgPath || item.LIST_IMG || item.thumbImgPath || '';
    const startDate = (item.startDt || item.BEGIN_DE || '').replace(/\./g, '-');
    const endDate = (item.endDt || item.END_DE || '').replace(/\./g, '-');
    const location = item.cntrNm || item.CNTR_NM || '';
    if (!id || !imgPath) continue;
    const imgUrl = imgPath.startsWith('http') ? imgPath : `https://www.mmca.go.kr${imgPath}`;
    const r2Key = `exhibitions/covers/mmca-${id}.${imgPath.split('.').pop() || 'jpg'}`;
    results.push({ id, title, imgUrl, r2Key, startDate, endDate, location, museum: 'mmca' });
  }
  return results;
}

// ── 2. NMK (국립중앙박물관) ─────────────────────────────────────
// URL: https://www.museum.go.kr/MUSEUM/contents/M0202010000.do?menuId=current
// 이미지: /afile/previewThumbnail/fileMng_MUSEUM...
async function scrapeNmk() {
  console.log('\n📍 NMK 스크래핑...');
  // NMK는 /MUSEUM/ 경로로만 접근 가능 (site/main은 루프)
  // HTML 파싱 필요
  const html = await fetchJson(
    'https://www.museum.go.kr/MUSEUM/contents/M0202010000.do?menuId=current'
  );
  const results = [];
  if (typeof html !== 'string') return results;
  // afile/previewThumbnail URL 추출
  const imgMatches = html.matchAll(/src="(\/afile\/previewThumbnail\/[^"]+)"/g);
  const altMatches = [...html.matchAll(/alt="([^"]+)"\s*src="\/afile\/previewThumbnail/g)];
  // 날짜 패턴 추출
  const dateMatches = [...html.matchAll(/(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/g)];
  let i = 0;
  for (const m of imgMatches) {
    const imgUrl = `https://www.museum.go.kr${m[1]}`;
    const title = altMatches[i]?.[1] || `nmk-exh-${i}`;
    const startDate = dateMatches[i]?.[1] || '';
    const endDate = dateMatches[i]?.[2] || '';
    const safeId = title.replace(/[^a-z0-9가-힣]/gi, '-').substring(0, 30);
    const r2Key = `exhibitions/covers/nmk-auto-${Date.now()}-${i}.jpg`;
    results.push({ title, imgUrl, r2Key, startDate, endDate, museum: 'nmk' });
    i++;
  }
  return results;
}

// ── 3. DDP (동대문디자인플라자) ──────────────────────────────────
// URL: https://ddp.or.kr/index.html?menuno=240
// 이미지: /usr/upload/board_thumb/zboardphotogallery0/
async function scrapeDdp() {
  console.log('\n📍 DDP 스크래핑...');
  const html = await fetchJson('https://ddp.or.kr/index.html?menuno=240');
  const results = [];
  if (typeof html !== 'string') return results;
  // 전시 블록 파싱: alt + src + 날짜
  const blocks = [...html.matchAll(/<img[^>]+alt="([^"]+)"[^>]+src="(\/usr\/upload\/board_thumb\/[^"]+)"[^>]*>/g)];
  const dateBlocks = [...html.matchAll(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/g)];
  for (let i = 0; i < blocks.length; i++) {
    const title = blocks[i][1];
    const imgPath = blocks[i][2];
    const imgUrl = `https://ddp.or.kr${imgPath}`;
    const startDate = dateBlocks[i]?.[1] || '';
    const endDate = dateBlocks[i]?.[2] || '';
    const safeId = `ddp-auto-${i}-${Date.now()}`;
    const r2Key = `exhibitions/covers/${safeId}.jpg`;
    results.push({ title, imgUrl, r2Key, startDate, endDate, museum: 'ddp' });
  }
  return results;
}

// ── 4. Leeum + Hoam ──────────────────────────────────────────────
// API: https://www.leeumhoam.org/api/exhibitions?status=ongoing
async function scrapeLeeumHoam() {
  console.log('\n📍 Leeum/Hoam 스크래핑...');
  const results = [];
  for (const museum of ['leeum', 'hoam']) {
    // leeumhoam.org 전시 목록 API (발견된 패턴)
    const apiUrl = `https://www.leeumhoam.org/api/exhibition/list?museumType=${museum === 'leeum' ? 'L' : 'H'}&status=ING`;
    try {
      const data = await fetchJson(apiUrl, { headers: { 'Referer': 'https://www.leeumhoam.org/' } });
      const items = Array.isArray(data) ? data : (data.data || data.list || []);
      for (const item of items) {
        const id = item.exhibitionId || item.id || '';
        const title = item.title || item.exhibitionTitle || '';
        const imgUrl = item.thumbnailUrl || item.coverImage || item.imgUrl || '';
        const startDate = (item.startDate || '').substring(0, 10);
        const endDate = (item.endDate || '').substring(0, 10);
        if (!imgUrl) continue;
        const ext = imgUrl.split('?')[0].split('.').pop() || 'jpg';
        const r2Key = `exhibitions/covers/${museum}-auto-${id}.${ext}`;
        results.push({ id, title, imgUrl, r2Key, startDate, endDate, museum });
      }
    } catch (e) {
      console.log(`  ⚠ ${museum} API 실패: ${e.message}`);
      // Fallback: HTML 파싱
      try {
        const html = await fetchJson(`https://www.leeumhoam.org/`, { headers: { 'Referer': 'https://www.leeumhoam.org/' } });
        if (typeof html === 'string') {
          const imgs = [...html.matchAll(/upload\/exhibition\/([^"'\s]+\.jpg)/g)];
          for (const m of imgs.slice(0, 5)) {
            const imgUrl = `https://www.leeumhoam.org/upload/exhibition/${m[1]}`;
            const r2Key = `exhibitions/covers/${museum}-auto-${Date.now()}.jpg`;
            results.push({ title: `${museum} 전시`, imgUrl, r2Key, museum });
          }
        }
      } catch {}
    }
  }
  return results;
}

// ── 5. APMA ──────────────────────────────────────────────────────
// API: https://apma.amorepacific.com/contents/exhibition/index.do
// 이미지: image-apma.amorepacific.com/upload/exhibition/m/
async function scrapeApma() {
  console.log('\n📍 APMA 스크래핑...');
  // APMA는 CORS 차단이므로 터미널에서 curl 사용
  const html = await fetchJson('https://apma.amorepacific.com/contents/exhibition/index.do', {
    headers: { 'Referer': 'https://apma.amorepacific.com/' }
  });
  const results = [];
  if (typeof html !== 'string') return results;
  const blocks = [...html.matchAll(/<img[^>]+src="(https:\/\/image-apma\.amorepacific\.com\/upload\/exhibition\/m\/[^"]+)"[^>]*>/g)];
  const titles = [...html.matchAll(/\[(APMA[^\]]+|[A-Z][A-Z\s:]+)\]/g)];
  const dates = [...html.matchAll(/(\d{4}\.\d{2}\.\d{2}).*?~.*?(\d{4}\.\d{2}\.\d{2})/g)];
  for (let i = 0; i < blocks.length; i++) {
    const imgUrl = blocks[i][1];
    const title = titles[i]?.[0] || `APMA 전시 ${i}`;
    const startDate = dates[i]?.[1]?.replace(/\./g, '-') || '';
    const endDate = dates[i]?.[2]?.replace(/\./g, '-') || '';
    const fname = imgUrl.split('/').pop().split('?')[0];
    const r2Key = `exhibitions/covers/apma-auto-${i}-${fname}`;
    results.push({ title, imgUrl, r2Key, startDate, endDate, museum: 'apma' });
  }
  return results;
}

// ── 6. SeMA (서울시립미술관) ─────────────────────────────────────
// 이미지: /common/imgFileView?FILE_ID=
async function scrapeSema() {
  console.log('\n📍 SeMA 스크래핑...');
  const results = [];
  try {
    const data = await fetchJson(
      'https://sema.seoul.go.kr/kr/exhibition/exhibitionListAjax.do?pageIndex=1&searchExbtSe=1&pageUnit=20',
      { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://sema.seoul.go.kr/' } }
    );
    const items = Array.isArray(data) ? data : (data.list || data.resultList || []);
    for (const item of items) {
      const id = item.EXBT_SN || item.exbtSn || '';
      const title = item.EXBT_NM || item.exbtNm || '';
      const fileId = item.FILE_ID || item.fileId || item.THUMBNAIL_FILE_ID || '';
      if (!fileId || !title) continue;
      const imgUrl = `https://sema.seoul.go.kr/common/imgFileView?FILE_ID=${fileId}`;
      const startDate = (item.BEGIN_DE || item.beginDe || '').replace(/\./g, '-');
      const endDate = (item.END_DE || item.endDe || '').replace(/\./g, '-');
      const r2Key = `exhibitions/covers/sema-auto-${id}.jpg`;
      results.push({ id: `sema-${id}`, title, imgUrl, r2Key, startDate, endDate, museum: 'sema',
        referer: 'https://sema.seoul.go.kr/' });
    }
  } catch (e) {
    console.log(`  ⚠ SeMA API 실패: ${e.message}`);
  }
  return results;
}

// ── 7. SAC 예술의전당 한가람 ─────────────────────────────────────
// API: /site/main/show/dataList?cp=1&PAGE_SIZE=20&catePriArr=6
async function scrapeSac() {
  console.log('\n📍 SAC 한가람 스크래핑...');
  const results = [];
  try {
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const futureDate = new Date(Date.now() + 365*24*3600*1000).toISOString().slice(0,10).replace(/-/g,'');
    const data = await fetchJson(
      `https://www.sac.or.kr/site/main/show/dataList?cp=1&PAGE_SIZE=20&BEGIN_DATE=${today}&END_DATE=${futureDate}&catePriArr=6`,
      { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://www.sac.or.kr/' } }
    );
    const items = Array.isArray(data) ? data : (data.paging?.result || data.list || []);
    for (const item of items) {
      const sn = item.SN || item.PROGRAM_SN || '';
      const title = item.PROGRAM_SUBJECT || item.programSubject || '';
      if (!sn || !title) continue;
      const imgUrl = `https://www.sac.or.kr/site/main/file/manage/${sn}`;
      const startDate = (item.BEGIN_DATE || item.beginDate || '').substring(0,10);
      const endDate = (item.END_DATE || item.endDate || '').substring(0,10);
      const r2Key = `exhibitions/covers/sac-${sn}.jpg`;
      results.push({ id: `hangaram-${sn}`, title, imgUrl, r2Key, startDate, endDate, museum: 'sac',
        referer: 'https://www.sac.or.kr/' });
    }
  } catch (e) {
    console.log(`  ⚠ SAC API 실패: ${e.message}`);
  }
  return results;
}

// ── 8. Groundseesaw ──────────────────────────────────────────────
// HTML 파싱: groundseesaw.cafe24.com CDN
async function scrapeGroundseesaw() {
  console.log('\n📍 Groundseesaw 스크래핑...');
  const results = [];
  try {
    const html = await fetchJson('https://www.groundseesaw.co.kr/', {
      headers: { 'Referer': 'https://www.groundseesaw.co.kr/' }
    });
    if (typeof html !== 'string') return results;
    // 이미지 URL 추출 (cafe24.com CDN)
    const imgs = [...html.matchAll(/src="(https:\/\/groundseesaw\.cafe24\.com\/[^"]+\.(jpg|jpeg|png|webp))"/gi)];
    // 텍스트에서 전시 제목+날짜 추출
    const textBlocks = [...html.matchAll(/(\d{2}\.\d{2}\.\d{2}\([^)]+\))\s*~\s*(\d{2}\.\d{2}\.\d{2}\([^)]+\))\s*([\s\S]{5,100}?)(?=\d{2}\.\d{2}|$)/g)];
    for (let i = 0; i < Math.min(imgs.length, 8); i++) {
      const imgUrl = imgs[i][1];
      // 중복 제거
      if (results.find(r => r.imgUrl === imgUrl)) continue;
      const r2Key = `exhibitions/covers/gss-auto-${i}-${imgUrl.split('/').pop().replace(/[^a-z0-9.]/gi,'-').substring(0,40)}`;
      results.push({ title: `Groundseesaw 전시 ${i+1}`, imgUrl, r2Key, museum: 'groundseesaw',
        referer: 'https://www.groundseesaw.co.kr/' });
    }
  } catch (e) {
    console.log(`  ⚠ Groundseesaw 실패: ${e.message}`);
  }
  return results;
}

// ── 9. BMA (부산시립미술관) ──────────────────────────────────────
// 참고: art.busan.go.kr — 동일 출처 Chrome fetch 필요
// URL: https://art.busan.go.kr/tblTsite07Display/listNowClient.nm  (현재)
//      https://art.busan.go.kr/tblTsite07Display/listFutureClient.nm (예정)
// HTML pattern: <img src="/uploadfiles/display/arthqpic/..." alt="전시 제목">
//               <span class="date">YYYY-MM-DD – YYYY-MM-DD</span>
async function scrapeBma() {
  console.log('\n📍 BMA 스크래핑...');
  const results = [];
  const BASE = 'https://art.busan.go.kr';
  const REFERER = `${BASE}/`;

  for (const [urlPath, statusType] of [
    ['/tblTsite07Display/listNowClient.nm', 'ongoing'],
    ['/tblTsite07Display/listFutureClient.nm', 'upcoming'],
  ]) {
    try {
      const html = await fetchJson(`${BASE}${urlPath}`, { headers: { 'Referer': REFERER, 'Accept': 'text/html' } });
      if (typeof html !== 'string') continue;

      // Extract each exhibition block: <div class="thumb_img"> ... </div>
      const blockRe = /<div class="thumb_img">([\s\S]*?)(?=<div class="thumb_img">|<\/ul>)/g;
      let bm;
      while ((bm = blockRe.exec(html)) !== null) {
        const block = bm[1];
        const imgMatch = block.match(/src="(\/uploadfiles\/display\/[^"]+\.(jpg|png|webp|jpeg))"/i);
        const titleMatch = block.match(/class="tit"[^>]*><a[^>]*>([^<]+)<\/a>/);
        const dateMatch = block.match(/class="date"[^>]*>(\d{4}-\d{2}-\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})/);
        if (!imgMatch || !titleMatch) continue;

        const imgUrl = `${BASE}${imgMatch[1]}`;
        const title = titleMatch[1].trim();
        const startDate = dateMatch?.[1] || '';
        const endDate = dateMatch?.[2] || '';
        const slug = title.replace(/[^a-z0-9가-힣]/gi, '-').toLowerCase().slice(0, 30);
        const ext = imgUrl.split('.').pop()?.toLowerCase() || 'jpg';
        const r2Key = `exhibitions/covers/bma-auto-${slug}.${ext}`;
        results.push({ title, imgUrl, r2Key, startDate, endDate, museum: 'bma', referer: REFERER, status: statusType });
      }
    } catch (e) {
      console.log(`  ⚠ BMA ${urlPath} 실패: ${e.message}`);
    }
  }
  return results;
}

// ── JMOA (제주도립미술관) ──────────────────────────────────────────
// URL: https://www.jeju.go.kr/jmoa/show/current.htm
// HTML pattern: <img src="/files/exhibition/{uuid}.jpg" alt="전시 제목">
// Dates: <span>YYYY.MM.DD ~ YYYY.MM.DD</span>
// Status class: READY(예정) / ING(진행) / END(종료) on parent <div class="list ex ... {STATUS}">
async function scrapeJmoa() {
  console.log('\n📍 JMOA 스크래핑...');
  const results = [];
  const BASE = 'https://www.jeju.go.kr';
  const REFERER = `${BASE}/jmoa/show/current.htm`;

  for (const stat of ['', '?stat=READY']) {
    try {
      const html = await fetchJson(`${BASE}/jmoa/show/current.htm${stat}`, {
        headers: { 'Referer': REFERER, 'Accept': 'text/html' }
      });
      if (typeof html !== 'string') continue;

      // Each exhibition block: <div class="list ex ... {STATUS}" ...>
      const blockRe = /<div class="list ex[^"]*\b(READY|ING|END)\b[^>]*>([\s\S]*?)(?=<div class="list ex|<\/div>\s*<\/div>\s*<\/div>\s*<div class="container)/g;
      let bm;
      while ((bm = blockRe.exec(html)) !== null) {
        const status = bm[1]; // READY, ING, END
        const block = bm[2];
        if (status === 'END') continue; // skip ended

        const imgMatch = block.match(/src="(\/files\/exhibition\/[^"]+\.(?:jpg|png|webp))"/i);
        const titleMatch = block.match(/alt="([^"]{3,})"/);
        const dateMatch = block.match(/(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/);

        if (!imgMatch || !titleMatch) continue;

        const imgUrl = `${BASE}${imgMatch[1]}`;
        const title = titleMatch[1].trim();
        const startDate = dateMatch ? dateMatch[1].replace(/\./g, '-') : '';
        const endDate = dateMatch ? dateMatch[2].replace(/\./g, '-') : '';
        const slug = title.replace(/[^가-힣a-z0-9]/gi, '-').toLowerCase().slice(0, 30);
        const ext = imgUrl.endsWith('.png') ? 'png' : 'jpg';
        const r2Key = `exhibitions/covers/jmoa-auto-${slug}.${ext}`;
        const exStatus = status === 'READY' ? 'upcoming' : 'ongoing';

        // dedupe by imgUrl
        if (results.some(r => r.imgUrl === imgUrl)) continue;

        results.push({ title, imgUrl, r2Key, startDate, endDate, museum: 'jmoa', referer: REFERER, status: exStatus });
      }
    } catch (e) {
      console.log(`  ⚠ JMOA 실패: ${e.message}`);
    }
  }
  return results;
}

// ════════════════════════════════════════════════════════════════
// 메인 실행
// ════════════════════════════════════════════════════════════════

// 인수로 특정 미술관만 실행할 수 있음
const targetArg = process.argv.find(a => a.startsWith('--museum='))?.split('=')[1]
  || process.argv[process.argv.indexOf('--museum') + 1];

const SCRAPERS = {
  mmca: scrapeMmca,
  nmk: scrapeNmk,
  ddp: scrapeDdp,
  leeum: scrapeLeeumHoam,
  hoam: scrapeLeeumHoam,
  apma: scrapeApma,
  sema: scrapeSema,
  sac: scrapeSac,
  groundseesaw: scrapeGroundseesaw,
  bma: scrapeBma,
  jmoa: scrapeJmoa,
};

async function main() {
  console.log('\n🎨 전시 데이터 동기화 시작\n');
  console.log(`R2: ${R2_BASE}`);
  console.log(`대상: ${targetArg || '전체'}\n`);

  const allResults = [];

  const toRun = targetArg
    ? { [targetArg]: SCRAPERS[targetArg] }
    : SCRAPERS;

  // 중복 실행 방지 (leeum/hoam 함께 실행)
  const ran = new Set();
  for (const [key, fn] of Object.entries(toRun)) {
    if (ran.has(fn)) continue;
    ran.add(fn);
    try {
      const results = await fn();
      allResults.push(...results);
      console.log(`  → ${results.length}개 항목 발견`);
    } catch (e) {
      console.error(`  ✗ ${key} 스크래퍼 오류: ${e.message}`);
    }
  }

  console.log(`\n총 ${allResults.length}개 이미지 처리 시작\n`);

  const uploaded = [];
  const failed = [];

  for (const item of allResults) {
    process.stdout.write(`  ${item.museum} | ${item.title?.substring(0,30)} | `);
    try {
      const { url, cached, size } = await ensureR2(item.imgUrl, item.r2Key, item.referer);
      item.r2Url = url;
      uploaded.push(item);
      console.log(cached ? `캐시됨` : `✓ ${(size/1024).toFixed(0)}KB → ${url.split('/').pop()}`);
    } catch (e) {
      item.error = e.message;
      failed.push(item);
      console.log(`✗ ${e.message}`);
    }
  }

  console.log(`\n📊 결과: ${uploaded.length} 성공 / ${failed.length} 실패\n`);

  if (uploaded.length > 0) {
    console.log('✅ R2 업로드 완료 항목:');
    for (const item of uploaded) {
      console.log(`  ${item.museum} | ${item.title?.substring(0,40)}`);
      console.log(`    이미지: ${item.r2Url}`);
      if (item.startDate) console.log(`    기간: ${item.startDate} ~ ${item.endDate}`);
    }
    console.log(`
⚠ exhibitions.js 자동 패치는 미지원입니다.
  위 정보를 참고해 exhibitions.js를 직접 업데이트하거나
  Claude에게 위 결과를 붙여넣어 업데이트를 요청하세요.
`);
  }

  if (failed.length > 0) {
    console.log('❌ 실패 항목:');
    for (const item of failed) {
      console.log(`  ${item.museum} | ${item.title?.substring(0,40)} | ${item.error}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
