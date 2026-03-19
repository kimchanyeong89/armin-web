const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const OUT_FILE = path.join(DATA_DIR, 'webp-size-estimate.json');
const EXHIBITIONS_FILE = path.join(ROOT, 'src', 'data', 'exhibitions.js');

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /no[-_ ]?image/i,
  /default[-_ ]?image/i,
  /image[-_ ]?not[-_ ]?available/i,
  /\/blank\./i,
  /data:image\//i,
  /\/spacer\./i,
  /\/transparent\./i,
  /\/pixel\./i,
  /imaginarium\.png/i,
];

function toItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const candidateKeys = ['items', 'artworks', 'objects', 'data', 'results', 'list', 'records', 'collection'];
  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (Array.isArray(payload.rooms)) {
    const merged = [];
    for (const room of payload.rooms) {
      if (room && Array.isArray(room.artworks)) merged.push(...room.artworks);
    }
    if (merged.length > 0) return merged;
  }

  return [];
}

function getImageUrl(item) {
  if (!item || typeof item !== 'object') return '';

  const keys = [
    'image', 'imageUrl', 'image_url', 'imageURL', 'thumbnail', 'thumbnailUrl',
    'thumbnail_url', 'img', 'imgUrl', 'primaryImage', 'primaryImageSmall',
    'fullImageUrl', 'fullImage', 'url', 'src', 'picture', 'preview', 'photo'
  ];

  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (first && typeof first.url === 'string' && first.url.trim()) return first.url.trim();
    if (first && typeof first.src === 'string' && first.src.trim()) return first.src.trim();
  }

  if (Array.isArray(item.media) && item.media.length > 0) {
    const first = item.media[0];
    if (first && typeof first.url === 'string' && first.url.trim()) return first.url.trim();
  }

  return '';
}

function isPlaceholderUrl(url) {
  if (!url) return true;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return null;
    const body = await response.arrayBuffer();
    const buf = Buffer.from(body);
    if (buf.length < 1024) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shuffleInPlace(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
  }
}

async function main() {
  const mod = await import(pathToFileURL(EXHIBITIONS_FILE).href);
  const exhibitions = mod.exhibitions || [];
  const allImageUrls = [];
  let totalArtworks = 0;
  let artworksWithImage = 0;

  for (const museum of exhibitions) {
    const permanent = Array.isArray(museum.permanentExhibitions) ? museum.permanentExhibitions : [];
    for (const ex of permanent) {
      if (!ex?.collectionFile) continue;
      const filePath = path.join(DATA_DIR, ex.collectionFile);
      if (!fs.existsSync(filePath)) continue;

      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        continue;
      }

      const items = toItems(payload);
      totalArtworks += items.length;
      for (const item of items) {
        const imageUrl = getImageUrl(item);
        if (!imageUrl || isPlaceholderUrl(imageUrl)) continue;
        artworksWithImage += 1;
        allImageUrls.push(imageUrl);
      }
    }
  }

  const uniqueUrls = [...new Set(allImageUrls)];
  shuffleInPlace(uniqueUrls);

  const maxPool = Math.min(uniqueUrls.length, 320);
  const pool = uniqueUrls.slice(0, maxPool);

  let fetched = 0;
  let converted = 0;
  let originalBytes = 0;
  let webpBytes = 0;

  for (const url of pool) {
    const buffer = await fetchWithTimeout(url, 15000);
    if (!buffer) continue;
    fetched += 1;
    try {
      const convertedBuffer = await sharp(buffer).webp({ quality: 100 }).toBuffer();
      converted += 1;
      originalBytes += buffer.length;
      webpBytes += convertedBuffer.length;
    } catch {
      // ignore invalid images for conversion
    }
    if (converted >= 120) break;
  }

  const avgOriginalBytes = converted > 0 ? originalBytes / converted : 0;
  const avgWebpBytes = converted > 0 ? webpBytes / converted : 0;
  const webpRatio = converted > 0 ? webpBytes / originalBytes : 0;

  const estimateAllBytes = avgWebpBytes * artworksWithImage;
  const estimateUniqueBytes = avgWebpBytes * uniqueUrls.length;

  const result = {
    generatedAt: new Date().toISOString(),
    totals: {
      totalArtworks,
      artworksWithImage,
      uniqueImageUrls: uniqueUrls.length,
    },
    sampling: {
      poolSize: pool.length,
      fetched,
      converted,
      avgOriginalKB: +(avgOriginalBytes / 1024).toFixed(2),
      avgWebp100KB: +(avgWebpBytes / 1024).toFixed(2),
      webpToOriginalRatio: +webpRatio.toFixed(4),
    },
    estimates: {
      allArtworksWebpGB: +(estimateAllBytes / 1024 / 1024 / 1024).toFixed(2),
      uniqueUrlsWebpGB: +(estimateUniqueBytes / 1024 / 1024 / 1024).toFixed(2),
    }
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main();
