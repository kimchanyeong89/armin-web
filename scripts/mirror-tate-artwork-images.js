#!/usr/bin/env node
/* Mirror images referenced in public/data/tate-artworks.json into public/images/tate-artworks
   Rewrites image + thumb fields to local paths.
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(process.cwd(), 'public', 'data', 'tate-artworks.json');
const OUT_DIR = path.join(process.cwd(), 'public', 'images', 'tate-artworks');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 70);
}
function extFrom(url, contentType='') {
  try {
    const m = new URL(url).pathname.match(/\.(jpg|jpeg|png|webp|gif|avif)$/i);
    if (m) return m[0].toLowerCase();
  } catch {}
  if (/jpeg|jpg/i.test(contentType)) return '.jpg';
  if (/png/i.test(contentType)) return '.png';
  if (/webp/i.test(contentType)) return '.webp';
  if (/gif/i.test(contentType)) return '.gif';
  if (/avif/i.test(contentType)) return '.avif';
  return '.jpg';
}

async function headExt(url) {
  try {
    const res = await got.head(url, { timeout: { request: 15000 } });
    return extFrom(url, res.headers['content-type'] || '');
  } catch {
    return extFrom(url);
  }
}

async function download(url, dest) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const stream = got.stream(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      timeout: { request: 25000 }
    });
    const file = fs.createWriteStream(dest);
    stream.on('error', reject);
    file.on('error', reject);
    file.on('finish', resolve);
    stream.pipe(file);
  });
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('Missing data file', DATA_FILE);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const items = Array.isArray(json.items) ? json.items : [];
  if (!items.length) {
    console.log('No artworks to mirror.');
    return;
  }
  let mirrored = 0;
  for (const it of items) {
    for (const field of ['image', 'thumb']) {
      const val = it[field];
      if (!val || !/^https?:\/\//i.test(val)) continue;
      const hash = crypto.createHash('md5').update(val).digest('hex').slice(0, 8);
      const base = slugify(it.title || it.id || 'artwork');
      const ext = await headExt(val);
      const name = `${base}-${hash}${ext}`;
      const dest = path.join(OUT_DIR, name);
      if (!fs.existsSync(dest)) {
        try {
          await download(val, dest);
          mirrored++;
        } catch (e) {
          console.warn('Failed image', val, e.message);
          continue;
        }
      }
      it[field] = `/images/tate-artworks/${name}`;
    }
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(json, null, 2));
  console.log(`Mirrored ${mirrored} images -> ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
