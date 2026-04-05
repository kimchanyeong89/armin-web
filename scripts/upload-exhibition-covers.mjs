/**
 * 전시 커버 이미지 R2 업로드 스크립트
 *
 * exhibitions.js의 temporaryExhibitions.coverImage URL을 파싱해서
 * 외부 CDN 이미지를 다운로드 → R2에 업로드 → URL 교체
 *
 * 실행: node scripts/upload-exhibition-covers.mjs
 */

import { execSync, exec } from 'child_process';
import { createWriteStream, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXHIBITIONS_JS = join(ROOT, 'src/data/exhibitions.js');
const TMP_DIR = join(os.tmpdir(), 'armin-exh-covers');
const BUCKET = 'armin-gallery-images';
const R2_PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');

// R2에 이미 올라가 있는 도메인 → 스킵
const ALREADY_R2 = ['pub-396fad1f96754c2f816f260faf970e63.r2.dev', 'pub-396fad1f96754c2f816f260faf970e63.r2.dev'];

// 도메인별 Referer 매핑
const REFERER_MAP = {
  'www.mmca.go.kr': 'https://www.mmca.go.kr/',
  'www.museum.go.kr': 'https://www.museum.go.kr/',
  'sema.seoul.go.kr': 'https://sema.seoul.go.kr/',
  'www.leeumhoam.org': 'https://www.leeumhoam.org/',
  'image-apma.amorepacific.com': 'https://www.apma.or.kr/',
  'art.busan.go.kr': 'https://art.busan.go.kr/',
  'www.jeju.go.kr': 'https://www.jeju.go.kr/',
  'www.ddp.or.kr': 'https://www.ddp.or.kr/',
  'groundseesaw.co.kr': 'https://groundseesaw.co.kr/',
  'images.metmuseum.org': 'https://www.metmuseum.org/',
  'upload.wikimedia.org': 'https://en.wikipedia.org/',
  'www.artic.edu': 'https://www.artic.edu/',
};

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

// ── 이미지 다운로드 ───────────────────────────────────────────
function downloadImage(url, destPath, referer) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const opts = new URL(url);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    };
    if (referer) headers['Referer'] = referer;

    const req = proto.get({ hostname: opts.hostname, path: opts.pathname + opts.search, headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, destPath, referer).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));

      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('image') && !contentType.includes('octet-stream')) {
        return reject(new Error(`Non-image content-type: ${contentType}`));
      }

      const file = createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        // 최소 크기 확인 (1KB 이상)
        const { size } = require('fs').statSync(destPath);
        if (size < 1024) return reject(new Error(`File too small (${size} bytes) — likely blocked`));
        resolve(contentType);
      });
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// statSync를 ESM에서 쓸 수 있도록
import { statSync } from 'fs';
function fileSizeOk(path) {
  try { return statSync(path).size >= 1024; } catch { return false; }
}

// ── R2 업로드 ─────────────────────────────────────────────────
function uploadToR2(localPath, r2Key, contentType) {
  const ct = contentType?.split(';')[0].trim() || 'image/jpeg';
  const cmd = `"${WRANGLER}" r2 object put "${BUCKET}/${r2Key}" --file "${localPath}" --content-type "${ct}" --cache-control "public, max-age=31536000"`;
  execSync(cmd, { stdio: 'pipe' });
  return `${R2_PUBLIC_BASE}/${r2Key}`;
}

// ── 전시 ID → R2 키 생성 ──────────────────────────────────────
function makeR2Key(exhibitionId, url) {
  const ext = url.includes('.webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg';
  const safe = exhibitionId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  return `exhibitions/covers/${safe}.${ext}`;
}

// ── exhibitions.js 파싱: coverImage URL → exhibition id 매핑 ──
function parseExhibitionCovers(src) {
  // temporaryExhibitions 배열 내 각 전시의 id + coverImage 추출
  const results = [];
  const exhBlockRe = /\{\s*id:\s*["'`]([^"'`]+)["'`][^}]*?coverImage:\s*["'`]([^"'`]+)["'`]/gs;
  let m;
  while ((m = exhBlockRe.exec(src)) !== null) {
    results.push({ id: m[1], url: m[2] });
  }
  return results;
}

// ── 메인 ─────────────────────────────────────────────────────
async function main() {
  let src = readFileSync(EXHIBITIONS_JS, 'utf8');
  const covers = parseExhibitionCovers(src);

  // 중복 제거 (같은 URL이 여러 곳에 있을 수 있음)
  const seen = new Set();
  const toProcess = covers.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    // 이미 R2에 있는 것 스킵
    const domain = new URL(url).hostname;
    if (ALREADY_R2.some(r => url.includes(r))) return false;
    return true;
  });

  console.log(`\n🎨 처리할 이미지: ${toProcess.length}개\n`);

  const urlMap = {}; // oldUrl → newR2Url

  for (const { id, url } of toProcess) {
    const domain = new URL(url).hostname;
    const referer = REFERER_MAP[domain] || `https://${domain}/`;
    const r2Key = makeR2Key(id, url);
    const tmpPath = join(TMP_DIR, r2Key.replace(/\//g, '_'));

    process.stdout.write(`  ⬇ ${id}: downloading...`);
    try {
      const contentType = await downloadImage(url, tmpPath, referer);
      if (!fileSizeOk(tmpPath)) throw new Error('File too small after download');
      process.stdout.write(` ✓ | ⬆ uploading to R2...`);
      const newUrl = uploadToR2(tmpPath, r2Key, contentType);
      urlMap[url] = newUrl;
      console.log(` ✓ → ${newUrl}`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      urlMap[url] = null; // 실패 표시
    }
  }

  // ── exhibitions.js URL 교체 ────────────────────────────────
  console.log('\n📝 exhibitions.js URL 교체 중...');
  let updated = 0;
  for (const [oldUrl, newUrl] of Object.entries(urlMap)) {
    if (!newUrl) continue;
    const escaped = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = src;
    src = src.replace(new RegExp(escaped, 'g'), newUrl);
    if (src !== before) {
      updated++;
      console.log(`  ✓ ${oldUrl.split('/').pop()} → R2`);
    }
  }

  writeFileSync(EXHIBITIONS_JS, src, 'utf8');
  console.log(`\n✅ 완료: ${updated}개 URL 교체, ${Object.values(urlMap).filter(v => !v).length}개 실패\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
