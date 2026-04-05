/**
 * 실제 미술관 전시 이미지 R2 업로드 스크립트
 * 브라우저 네트워크 캡처로 발견된 실제 이미지 URL들을 다운로드 → R2 업로드 → exhibitions.js 패치
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
const TMP_DIR = join(os.tmpdir(), 'armin-real-images');
const BUCKET = 'armin-gallery-images';
const R2_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const WRANGLER = join(ROOT, 'node_modules/.bin/wrangler');

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

// ── 실제 이미지 URL 맵 ────────────────────────────────────────────
// { exhibitionId: { srcUrl, referer, r2Key, ext } }
const REAL_IMAGES = [
  // ── Leeum ──────────────────────────────────────────────────────
  {
    id: 'leeum-2026-sehgal',
    srcUrl: 'https://www.leeumhoam.org/upload/exhibition/1771822635575_TS-Exhibition%20Banner-v2.jpg',
    referer: 'https://www.leeumhoam.org/',
    r2Key: 'exhibitions/covers/leeum-2026-sehgal.jpg',
    ext: 'jpg',
  },
  {
    id: 'leeum-2026-orozco',
    srcUrl: 'https://www.leeumhoam.org/upload/exhibition/1775193860507_Orozco%20Garden_Leeum%20website.jpg',
    referer: 'https://www.leeumhoam.org/',
    r2Key: 'exhibitions/covers/leeum-2026-orozco.jpg',
    ext: 'jpg',
  },
  // ── Hoam ───────────────────────────────────────────────────────
  {
    id: 'hoam-2026-kimyunshin',
    srcUrl: 'https://www.leeumhoam.org/upload/exhibition/1772008641261_%EC%A0%84%EC%8B%9C%20%EC%83%81%EC%84%B8%20%ED%8E%98%EC%9D%B4%EC%A7%80.jpg',
    referer: 'https://www.leeumhoam.org/',
    r2Key: 'exhibitions/covers/hoam-2026-kimyunshin.jpg',
    ext: 'jpg',
  },
  {
    id: 'hoam-2026-artspectrum',
    srcUrl: 'https://www.leeumhoam.org/upload/exhibition/1761554456228__1.%20%EC%8B%A4%EB%A0%8C%ED%8B%B0%EC%9B%80_2.jpg',
    referer: 'https://www.leeumhoam.org/',
    r2Key: 'exhibitions/covers/hoam-2026-artspectrum.jpg',
    ext: 'jpg',
  },
  // ── APMA ───────────────────────────────────────────────────────
  {
    id: 'apma-2026-chapter5',
    srcUrl: 'https://image-apma.amorepacific.com/upload/exhibition/m/1774428952636_Y6MWK8M7VA_Cropped.jpg',
    referer: 'https://apma.amorepacific.com/',
    r2Key: 'exhibitions/covers/apma-2026-chapter5.jpg',
    ext: 'jpg',
  },
  // ── Groundseesaw (Cafe24 CDN) ───────────────────────────────────
  {
    id: 'groundseesaw-2026-max',
    srcUrl: 'https://groundseesaw.cafe24.com/%EC%A0%84%EC%8B%9C%20%ED%8F%AC%EC%8A%A4%ED%84%B0/%EB%A9%94%EC%9D%B8%20%ED%8F%AC%EC%8A%A4%ED%84%B0/MAX_KV_7_%EC%B5%9C%EC%A2%85_img-only_260107.jpg',
    referer: 'https://www.groundseesaw.co.kr/',
    r2Key: 'exhibitions/covers/groundseesaw-2026-max.jpg',
    ext: 'jpg',
  },
  {
    id: 'groundseesaw-2026-roomforwonder',
    srcUrl: 'https://groundseesaw.cafe24.com/GSS_WEB_MAIN_RFW_260126.jpg',
    referer: 'https://www.groundseesaw.co.kr/',
    r2Key: 'exhibitions/covers/groundseesaw-2026-roomforwonder.jpg',
    ext: 'jpg',
  },
];

// ── 이미지 다운로드 ───────────────────────────────────────────────
function downloadImage(url, destPath, referer) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const proto = parsedUrl.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    };
    if (referer) headers['Referer'] = referer;

    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      const u = new URL(reqUrl);
      const p = u.protocol === 'https:' ? https : http;
      const req = p.get({
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${u.protocol}//${u.hostname}${res.headers.location}`;
          res.resume();
          return makeRequest(nextUrl, redirectCount + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const ct = res.headers['content-type'] || '';
        if (!ct.includes('image') && !ct.includes('octet-stream')) {
          return reject(new Error(`Non-image: ${ct}`));
        }
        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const size = statSync(destPath).size;
          if (size < 1024) return reject(new Error(`Too small: ${size}b`));
          resolve(ct);
        });
        file.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    };
    makeRequest(url);
  });
}

// ── R2 업로드 ─────────────────────────────────────────────────────
function uploadToR2(localPath, r2Key, contentType) {
  const ct = (contentType || 'image/jpeg').split(';')[0].trim();
  const NODE = '/Users/kietzsche/.nvm/versions/node/v22.22.2/bin/node';
  execSync(
    `"${NODE}" "${WRANGLER}" r2 object put "${BUCKET}/${r2Key}" --file "${localPath}" --content-type "${ct}" --cache-control "public, max-age=31536000"`,
    { stdio: 'pipe', env: { ...process.env, PATH: `/Users/kietzsche/.nvm/versions/node/v22.22.2/bin:${process.env.PATH}` } }
  );
  return `${R2_BASE}/${r2Key}`;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n🎨 실제 전시 이미지 R2 업로드\n');

  let src = readFileSync(EXHIBITIONS_JS, 'utf8');
  const urlMap = {}; // exhibitionId → new R2 URL

  for (const img of REAL_IMAGES) {
    const tmpPath = join(TMP_DIR, img.r2Key.replace(/\//g, '_'));
    process.stdout.write(`  📸 ${img.id} ⬇...`);
    try {
      const ct = await downloadImage(img.srcUrl, tmpPath, img.referer);
      process.stdout.write(` ⬆...`);
      const r2Url = uploadToR2(tmpPath, img.r2Key, ct);
      urlMap[img.id] = r2Url;
      console.log(` ✓ ${r2Url}`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  // ── exhibitions.js 패치 ──────────────────────────────────────────
  console.log('\n📝 exhibitions.js 패치 중...\n');

  // 1. Leeum Sehgal URL (already R2, just update)
  if (urlMap['leeum-2026-sehgal']) {
    src = src.replace(
      /("id":\s*"leeum-2026-sehgal"[^}]*?"coverImage":\s*")[^"]+"/s,
      (m, prefix) => `${prefix}${urlMap['leeum-2026-sehgal']}"`
    );
  }

  // 2. Leeum Orozco - replace MetMuseum URL
  if (urlMap['leeum-2026-orozco']) {
    src = src.replace(
      'https://images.metmuseum.org/CRDImages/la/original/DP251140.jpg',
      urlMap['leeum-2026-orozco']
    );
  }

  // 3. Leeum koojunga - also replace the duplicate sehgal URL
  if (urlMap['leeum-2026-sehgal']) {
    // The koojunga entry wrongly uses leeum-2026-sehgal.jpg - leave as-is for now
    // since we don't have a koojunga image
  }

  // 4. Hoam kimyunshin - replace any old leeumhoam.org coverImage in the kimyunshin block
  if (urlMap['hoam-2026-kimyunshin']) {
    src = src.replace(
      /("id":\s*"hoam-2026-kimyunshin"[\s\S]*?"coverImage":\s*")[^"]+"/,
      (m, prefix) => `${prefix}${urlMap['hoam-2026-kimyunshin']}"`
    );
  }

  // 5. Hoam artspectrum - replace old coverImage in artspectrum block
  if (urlMap['hoam-2026-artspectrum']) {
    src = src.replace(
      /("id":\s*"hoam-2026-artspectrum"[\s\S]*?"coverImage":\s*")[^"]+"/,
      (m, prefix) => `${prefix}${urlMap['hoam-2026-artspectrum']}"`
    );
  }

  // 6. APMA chapter5 - replace Wikimedia Hockney
  if (urlMap['apma-2026-chapter5']) {
    src = src.replace(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/David_Hockney%2C_A_Bigger_Splash%2C_1967.jpg/800px-David_Hockney%2C_A_Bigger_Splash%2C_1967.jpg',
      urlMap['apma-2026-chapter5']
    );
  }

  // 7. Groundseesaw - update to real exhibitions
  const groundseesawBlock = `  {
    id: "groundseesaw",
    slug: "groundseesaw",
    name: "그라운드시소",
    name_en: "Ground Seesaw",
    location: "서울특별시 종로구 자하문로 35 (서촌점)",
    location_en: "35 Jahamun-ro, Jongno-gu, Seoul (Seocho)",
    description: "서촌·한남·성수에 위치한 복합 문화공간. 사진, 일러스트, 그래픽 아트 중심의 대중적인 기획전을 주로 개최하며 MZ세대 감성의 전시로 큰 인기를 얻고 있다.",
    latitude: 37.5842,
    longitude: 126.9666,
    country: "South Korea",
    region: "Seoul",
    representativeImage: "https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-max.jpg",
    permanentExhibitions: [],
    temporaryExhibitions: [
      {
        id: "groundseesaw-2026-max",
        title: "맥스 시덴토프 개인전",
        titleEn: "Max Siedentopf: Solo Exhibition",
        description: "독일 출신 사진작가 겸 감독 맥스 시덴토프의 국내 첫 개인전. 유머와 부조리함으로 가득한 그의 작업 세계를 통해 일상과 예술의 경계를 탐구한다.",
        startDate: "2026-03-27",
        endDate: "2026-08-30",
        coverImage: "${urlMap['groundseesaw-2026-max'] || 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-max.jpg'}",
        officialUrl: "https://www.groundseesaw.co.kr",
        status: "ongoing"
      },
      {
        id: "groundseesaw-2026-roomforwonder",
        title: "룸 포 원더: 상상의 문을 열다",
        titleEn: "Room for Wonder: Open the Door to Imagination",
        description: "그라운드시소 성수 이스트관의 몰입형 복합 전시. 동화적 세계관과 인터랙티브 설치로 구성된 대형 체험전이다.",
        startDate: "2025-12-19",
        endDate: "2026-06-07",
        coverImage: "${urlMap['groundseesaw-2026-roomforwonder'] || 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/exhibitions/covers/groundseesaw-2026-roomforwonder.jpg'}",
        officialUrl: "https://www.groundseesaw.co.kr",
        status: "ongoing"
      }
    ],`;

  // Find and replace the entire groundseesaw museum block
  src = src.replace(
    /\{\s*id:\s*"groundseesaw",[\s\S]*?temporaryExhibitions:\s*\[[\s\S]*?]\s*,/,
    groundseesawBlock
  );

  writeFileSync(EXHIBITIONS_JS, src, 'utf8');
  console.log('\n✅ exhibitions.js 패치 완료!\n');
  console.log('📊 업로드 결과:');
  for (const [id, url] of Object.entries(urlMap)) {
    console.log(`  ✓ ${id} → ${url}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
