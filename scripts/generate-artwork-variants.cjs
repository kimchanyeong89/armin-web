#!/usr/bin/env node
/**
 * 사전 이미지 파생(thumb, lq, variants) 생성 스크립트 초안.
 * 전제: 원본 이미지가 로컬 디렉토리(sourceDir) 또는 Firebase Storage에 있고,
 * 여기서는 로컬 경로 기준으로 thumb/lq/webp/avif를 생성한 뒤 metadata JSON 출력.
 * 실제 Firestore 업데이트는 별도 admin SDK 스크립트에서 수행하도록 분리 권장.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sourceDir = path.resolve(process.argv[2] || 'raw-artworks');
const outDir = path.resolve(process.argv[3] || 'public/generated');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const widths = [320,480,640,720,960,1280,1600];

(async () => {
  const files = fs.readdirSync(sourceDir).filter(f=>/\.(jpe?g|png)$/i.test(f));
  const manifest = [];
  for (const file of files) {
    const base = file.replace(/\.(jpe?g|png)$/i,'');
    const srcPath = path.join(sourceDir, file);
    const img = sharp(srcPath);
    const meta = await img.metadata();

    // thumb (가로 160px)
    const thumbName = base + '.thumb.jpg';
    await img.clone().resize({ width: 160 }).jpeg({ quality: 55 }).toFile(path.join(outDir, thumbName));

    // lq (가로 400px, blur 효과를 위해 낮은 quality)
    const lqName = base + '.lq.jpg';
    await img.clone().resize({ width: 400 }).jpeg({ quality: 35 }).toFile(path.join(outDir, lqName));

    const variants = { webp: {}, avif: {}, jpg: {} };
    for (const w of widths) {
      if (meta.width && w > meta.width) continue; // 원본보다 큰 리사이즈 생략
      const jpgName = `${base}.${w}.jpg`;
      const webpName = `${base}.${w}.webp`;
      const avifName = `${base}.${w}.avif`;
      await img.clone().resize({ width: w }).jpeg({ quality: 72 }).toFile(path.join(outDir, jpgName));
      await img.clone().resize({ width: w }).webp({ quality: 70 }).toFile(path.join(outDir, webpName));
      await img.clone().resize({ width: w }).avif({ quality: 60 }).toFile(path.join(outDir, avifName));
      variants.jpg[w] = `/generated/${jpgName}`;
      variants.webp[w] = `/generated/${webpName}`;
      variants.avif[w] = `/generated/${avifName}`;
    }

    manifest.push({
      id: base,
      original: `/generated/${base}.orig${path.extname(file).toLowerCase()}`,
      thumb: `/generated/${thumbName}`,
      lq: `/generated/${lqName}`,
      variants,
    });
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Generated variants for', manifest.length, 'images');
})();
