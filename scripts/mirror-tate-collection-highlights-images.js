#!/usr/bin/env node
/* Mirror images referenced in public/data/tate-collection-highlights-artworks.json into public/images/tate-collection-highlights
   Rewrites image + thumb fields to local paths.
*/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(process.cwd(), 'public', 'data', 'tate-collection-highlights-artworks.json');
const OUT_DIR = path.join(process.cwd(), 'public', 'images', 'tate-collection-highlights');

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
      timeout: { request: 30000 },
      retry: { limit: 2 }
    });
    const file = fs.createWriteStream(dest);
    stream.pipe(file);
    stream.on('error', reject);
    file.on('error', reject);
    file.on('finish', () => resolve());
  });
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const items = data.items || [];
  console.log(`Processing ${items.length} artworks...`);

  for (const item of items) {
    const images = [];
    if (item.image) images.push({ field: 'image', url: item.image });
    if (item.thumb) images.push({ field: 'thumb', url: item.thumb });

    for (const img of images) {
      try {
        const hash = crypto.createHash('md5').update(img.url).digest('hex').slice(0, 8);
        const ext = await headExt(img.url);
        const slug = slugify(item.title || item.id);
        const filename = `${slug}-${hash}${ext}`;
        const dest = path.join(OUT_DIR, filename);

        if (fs.existsSync(dest)) {
          console.log(`Skip existing: ${filename}`);
        } else {
          console.log(`Download: ${img.url} -> ${filename}`);
          await download(img.url, dest);
        }

        // Rewrite to local path
        item[img.field] = `/images/tate-collection-highlights/${filename}`;
      } catch (e) {
        console.error(`Failed ${img.url}:`, e.message);
      }
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('Done.');
}

main().catch(console.error);