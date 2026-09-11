// 후쿠오카 아시아미술관 이미지를 미술관 원본에서 다시 인코딩해 올린다.
//
// 왜: toWebp 가 축소 여부와 무관하게 q80 을 쓰던 시절에 수집한 탓에,
//     긴변 1200px 고정 파생본(축소할 게 없는 이미지)이 원본 정보량의 29~35%
//     까지 눌렸다. 사용자가 "저화질"로 지목한 게 이 압축 흔적이다.
//     scope-filter 의 toWebp 는 고쳤고, 이 스크립트가 기존 분을 되돌린다.
//
// 원본이 이미 물러진 것(원본 자체가 0.08 B/px 미만)은 재인코딩해도 못 살리므로
// 따로 기록해 사용자가 삭제 여부를 판단할 수 있게 한다.
//
//   node scripts/reencode-faam-images.mjs --limit 20   # 파일럿
//   node scripts/reencode-faam-images.mjs              # 전체

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });

const FILE = path.join(ROOT, 'public/data/faam-fukuoka-collection.json');
const SIZES = path.join(ROOT, 'scripts/.state/faam-sizes.json');
const POOR = path.join(ROOT, 'scripts/.state/faam-poor-originals.json');
const BUCKET = 'armin-gallery-images';
// 이 값 아래로 눌린 것만 다시 만든다. 이미 충분한 것을 또 올릴 이유가 없다.
const BPP_FLOOR = 0.12;
// 원본이 이 아래면 재인코딩해도 소용없다 — 미술관이 내보내는 것 자체가 물렀다.
const ORIGINAL_FLOOR = 0.08;

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const sizes = new Map(JSON.parse(fs.readFileSync(SIZES, 'utf8')).map(x => [x.id, x]));

// 눌린 정도로 대상을 고른다
const todo = data.artworks.filter(a => {
  const s = sizes.get(a.id);
  if (!s || !s.w || !a.original_imageUrl) return false;
  return (s.kb * 1024) / (s.w * s.h) < BPP_FLOOR;
}).slice(0, LIMIT);

console.log(`[reencode] 전체 ${data.artworks.length}점 · 눌린 것 ${todo.length}점 (< ${BPP_FLOOR} B/px)\n`);

const stat = { done: 0, poor: 0, failed: 0, before: 0, after: 0 };
const poor = [];
const lim = pLimit(8);
let n = 0;

await Promise.all(todo.map(a => lim(async () => {
  try {
    const r = await fetch(a.original_imageUrl, { signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const src = Buffer.from(await r.arrayBuffer());
    const md = await sharp(src).metadata();
    const px = (md.width || 1) * (md.height || 1);
    const srcBpp = src.length / px;

    if (srcBpp < ORIGINAL_FLOOR) {
      // 원본이 이미 물렀다. 다시 만들어도 나아지지 않으므로 목록만 남긴다.
      poor.push({ id: a.id, title: a.title, w: md.width, h: md.height,
                  originalBpp: +srcBpp.toFixed(3), url: a.sourceUrl });
      stat.poor++;
      return;
    }

    const out = await sharp(src, { limitInputPixels: false })
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: Math.max(md.width, md.height) > 1600 ? 80 : 92 })
      .toBuffer();

    // 같은 키로 덮어쓴다 — JSON 의 imageUrl 을 건드릴 필요가 없고,
    // 캐시는 CacheControl 이 만료시킨다.
    const key = new URL(a.imageUrl).pathname.replace(/^\//, '');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: out, ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000',
    }));

    const old = sizes.get(a.id);
    stat.before += old.kb * 1024;
    stat.after += out.length;
    stat.done++;
  } catch (e) {
    stat.failed++;
  }
  if (++n % 200 === 0) {
    console.log(`[reencode] ${n}/${todo.length} — 재생성 ${stat.done} · 원본부실 ${stat.poor} · 실패 ${stat.failed}`);
  }
})));

fs.writeFileSync(POOR, JSON.stringify(poor, null, 1));
const mb = b => (b / 1048576).toFixed(1);
console.log(`\n[reencode] 완료 — 재생성 ${stat.done} · 원본부실 ${stat.poor} · 실패 ${stat.failed}`);
console.log(`[reencode] 용량 ${mb(stat.before)}MB → ${mb(stat.after)}MB`);
console.log(`[reencode] 원본이 부실한 ${poor.length}건은 ${path.relative(ROOT, POOR)} 에 기록했다.`);
