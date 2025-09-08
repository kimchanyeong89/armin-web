#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(process.cwd(), 'public', 'data', 'tate-modern.json');
const OUT_DIR = path.join(process.cwd(), 'public', 'images', 'tate');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

function extFromUrlOrType(url, contentType) {
  const u = new URL(url);
  const m = u.pathname.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i);
  if (m) return m[0].toLowerCase();
  if (contentType) {
    if (contentType.includes('image/jpeg')) return '.jpg';
    if (contentType.includes('image/png')) return '.png';
    if (contentType.includes('image/webp')) return '.webp';
    if (contentType.includes('image/avif')) return '.avif';
    if (contentType.includes('image/gif')) return '.gif';
  }
  return '.jpg';
}

async function downloadImage(url, outPath) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  const stream = got.stream(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    },
    timeout: { request: 20000 }
  });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    stream.on('error', reject);
    file.on('error', reject);
    file.on('finish', resolve);
    stream.pipe(file);
  });
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('Missing data file:', DATA_FILE);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) {
    console.log('No items to mirror.');
    return;
  }

  await fs.promises.mkdir(OUT_DIR, { recursive: true });

  let mirrored = 0;
  for (const it of items) {
    const img = it.image || '';
    if (!img || !/^https?:\/\//i.test(img)) continue;
    const hash = crypto.createHash('md5').update(img).digest('hex').slice(0, 8);
    const base = slugify(it.title || 'tate-modern');
    let ext = '.jpg';
    try {
      const head = await got.head(img, { timeout: { request: 15000 } });
      ext = extFromUrlOrType(img, head.headers['content-type'] || '');
    } catch {
      ext = extFromUrlOrType(img, '');
    }
    const fileName = `${base}-${hash}${ext}`;
    const outPath = path.join(OUT_DIR, fileName);
    if (!fs.existsSync(outPath)) {
      try {
        await downloadImage(img, outPath);
        mirrored++;
      } catch (e) {
        console.warn('Failed to download image:', img, e.message);
        continue;
      }
    }
    // Rewrite to local path used by the app
    it.image = `/images/tate/${fileName}`;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify({ ...data, items }, null, 2));
  console.log(`Mirrored ${mirrored} images to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
