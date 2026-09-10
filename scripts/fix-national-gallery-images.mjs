// 내셔널 갤러리(런던) 컬렉션의 제목↔이미지 짝을 바로잡는다.
//
// 문제: 기존 데이터의 70%가 다른 작품 이미지를 가리킨다. 표본 50건 중 33건 불일치.
//   예) "The Skiff (La Yole)" (NG6478) 인데 이미지는 n-6319-… (다른 르누아르, 목욕하는 여인).
//   목록과 이미지를 따로 긁어 인덱스로 맞춘 흔적이다.
//
// 고치는 법: 각 레코드의 `url`(작품 상세 페이지)은 정확하다. 그 페이지를 다시 열어
//   <title> 의 인벤토리 번호(NG6478)와 본문의 해당 이미지(n-6478-…)를 뽑아 다시 짝짓는다.
//   내려받은 이미지는 R2 에 새 키로 올리고 imageUrl 을 교체한다.
//
//   node scripts/fix-national-gallery-images.mjs --limit 30   # 파일럿
//   node scripts/fix-national-gallery-images.mjs              # 전체
//   node scripts/fix-national-gallery-images.mjs --resume

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit from 'p-limit';
import dotenv from 'dotenv';
import { judgeImage, toWebp } from './lib/scope-filter.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const FILE = path.join(ROOT, 'public/data/national-gallery-permanent.json');
const STATE = path.join(ROOT, 'scripts/.state');
const PROGRESS = path.join(STATE, 'national-gallery-fix-progress.json');
const REJECT = path.join(STATE, 'national-gallery-fix-rejected.ndjson');

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36' };
const BUCKET = 'armin-gallery-images';
const PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const PREFIX = 'artworks/national-gallery-permanent';
const CONCURRENCY = 4;

const sha8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (r.ok) return r;
      if (r.status === 404) return null;
    } catch { /* 재시도 */ }
    await new Promise(res => setTimeout(res, 1000 * (i + 1)));
  }
  return null;
}

/**
 * 작품 페이지에서 그 작품의 인벤토리 번호와 이미지를 뽑는다.
 * <title> 은 "작가 | 제목 | NG6478 | National Gallery, London" 형식이고,
 * 본문에는 여러 작품 이미지(추천·배너)가 섞여 있으므로 **번호가 일치하는 파일만** 고른다.
 */
function extractCorrectImage(html) {
  const inv = (html.match(/\|\s*((?:NG|L)\d+)\s*\|/) || [])[1];
  if (!inv) return null;
  const num = inv.replace(/\D/g, '');
  const prefix = inv.startsWith('L') ? 'l' : 'n';
  // n-6478-00-000036-xl-hd.jpg 처럼 번호가 앞자리에 오는 파일만 채택
  const re = new RegExp(`/media/[a-z0-9]+/${prefix}-0*${num}-[^"'\\s]+\\.jpg`, 'gi');
  const hits = [...new Set(html.match(re) || [])];
  if (!hits.length) return null;
  // xl-hd > web-hd > 나머지 순으로 큰 것을 고른다
  const best = hits.find(h => /xl-hd/i.test(h)) || hits.find(h => /web-hd/i.test(h)) || hits[0];
  return { inv, url: 'https://www.nationalgallery.org.uk' + best };
}

async function main() {
  const args = process.argv.slice(2);
  const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const RESUME = args.includes('--resume');

  fs.mkdirSync(STATE, { recursive: true });
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const items = data.items;
  const done = RESUME && fs.existsSync(PROGRESS)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')))) : new Map();
  const rejects = fs.createWriteStream(REJECT, { flags: RESUME ? 'a' : 'w' });

  const todo = items.filter(x => x.url && !done.has(x.id)).slice(0, LIMIT);
  console.log(`[ng-fix] 전체 ${items.length}건 · 이번 실행 ${todo.length}건 (완료 ${done.size})\n`);

  const stat = { fixed: 0, alreadyOk: 0, noImage: 0, failed: 0 };
  const lim = pLimit(CONCURRENCY);
  let n = 0;
  const tick = () => {
    if (++n % 200 === 0) {
      console.log(`[ng-fix] ${n}/${todo.length} — 교체 ${stat.fixed} · 이미 정상 ${stat.alreadyOk} · 이미지없음 ${stat.noImage} · 실패 ${stat.failed}`);
      fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
    }
  };

  await Promise.all(todo.map(x => lim(async () => {
    try {
      const res = await get(x.url);
      if (!res) { stat.failed++; rejects.write(JSON.stringify({ id: x.id, reason: 'page-failed' }) + '\n'); done.set(x.id, { skip: 'page-failed' }); tick(); return; }
      const found = extractCorrectImage(await res.text());
      if (!found) { stat.noImage++; rejects.write(JSON.stringify({ id: x.id, reason: 'no-matching-image' }) + '\n'); done.set(x.id, { skip: 'no-image' }); tick(); return; }

      // 이미 맞는 이미지를 쓰고 있으면 건드리지 않는다
      const ourNum = (String(x.originalImage || '').match(/\/[nl]-(\d+)-/i) || [])[1] || '';
      const rightNum = found.inv.replace(/\D/g, '');
      if (ourNum && ourNum.replace(/^0+/, '') === rightNum) {
        stat.alreadyOk++; done.set(x.id, { ok: true }); tick(); return;
      }

      const ir = await get(found.url);
      if (!ir) { stat.failed++; rejects.write(JSON.stringify({ id: x.id, reason: 'image-failed', url: found.url }) + '\n'); done.set(x.id, { skip: 'image-failed' }); tick(); return; }
      const buf = Buffer.from(await ir.arrayBuffer());
      const verdict = await judgeImage(buf, 'painting');
      if (!verdict.ok) { stat.failed++; rejects.write(JSON.stringify({ id: x.id, reason: verdict.reason }) + '\n'); done.set(x.id, { skip: verdict.reason }); tick(); return; }

      const key = `${PREFIX}/${x.id}-${sha8(found.url)}-imageUrl.webp`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: key, Body: await toWebp(buf), ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      }));
      done.set(x.id, { key, inv: found.inv, src: found.url });
      stat.fixed++;
    } catch (e) {
      stat.failed++; rejects.write(JSON.stringify({ id: x.id, reason: 'error: ' + e.message }) + '\n'); done.set(x.id, { skip: 'error' });
    }
    tick();
  })));

  fs.writeFileSync(PROGRESS, JSON.stringify(Object.fromEntries(done)));
  rejects.end();
  console.log(`\n[ng-fix] 완료 — 교체 ${stat.fixed} · 이미 정상 ${stat.alreadyOk} · 이미지없음 ${stat.noImage} · 실패 ${stat.failed}`);

  if (LIMIT === Infinity) {
    let applied = 0;
    for (const x of items) {
      const r = done.get(x.id);
      if (!r || !r.key) continue;
      x.image = `${PUBLIC_BASE}/${r.key}`;
      x.originalImage = r.src;
      x.inventoryNumber = r.inv;
      applied++;
    }
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    console.log(`[ng-fix] JSON 갱신 — ${applied}건 이미지 교체`);
  } else {
    console.log('[ng-fix] 파일럿이므로 JSON 미변경');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
