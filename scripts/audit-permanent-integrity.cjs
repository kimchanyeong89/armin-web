const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXHIBITIONS_FILE = path.join(ROOT, 'src', 'data', 'exhibitions.js');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const OUT_FILE = path.join(ROOT, 'public', 'data', 'audit-permanent-integrity.json');

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

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function toItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];

  const candidates = [
    payload.items,
    payload.artworks,
    payload.objects,
    payload.data,
    payload.results,
    payload.list,
    payload.records,
    payload.collection,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.value)) return payload.value;

  if (Array.isArray(payload.rooms)) {
    const merged = [];
    for (const room of payload.rooms) {
      if (room && Array.isArray(room.artworks)) {
        merged.push(...room.artworks);
      }
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
  for (const k of keys) {
    const v = item[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
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
  for (const p of PLACEHOLDER_PATTERNS) {
    if (p.test(url)) return true;
  }
  return false;
}

function main() {
  fs.readFileSync(EXHIBITIONS_FILE, 'utf8');
  const mod = require(EXHIBITIONS_FILE);
  const exhibitions = mod.exhibitions || [];

  const pairs = [];
  for (const museum of exhibitions) {
    const permanent = Array.isArray(museum?.permanentExhibitions) ? museum.permanentExhibitions : [];
    for (const ex of permanent) {
      if (!ex || !ex.collectionFile) continue;
      pairs.push({
        country: museum.country || 'Unknown',
        region: museum.region || '',
        museumId: museum.id || 'unknown',
        museumName: museum.name || museum.id || 'Unknown',
        exhibitionId: ex.id || 'unknown-exhibition',
        collectionFile: ex.collectionFile,
      });
    }
  }

  const records = [];
  let totalArtworks = 0;

  for (const pair of pairs) {
    const filePath = path.join(DATA_DIR, pair.collectionFile);
    const fileExists = fs.existsSync(filePath);

    let items = [];
    let parseError = false;
    if (fileExists) {
      const payload = safeReadJson(filePath);
      if (payload === null) {
        parseError = true;
      } else {
        items = toItems(payload);
      }
    }

    const total = items.length;
    totalArtworks += total;
    let missingImage = 0;
    let placeholderImage = 0;
    const imageCountMap = new Map();

    for (const item of items) {
      const url = getImageUrl(item);
      if (!url) {
        missingImage += 1;
        continue;
      }
      if (isPlaceholderUrl(url)) placeholderImage += 1;
      imageCountMap.set(url, (imageCountMap.get(url) || 0) + 1);
    }

    const duplicateHeavy = Array.from(imageCountMap.values())
      .filter((v) => v >= 10)
      .reduce((a, b) => a + b, 0);

    records.push({
      country: pair.country,
      region: pair.region,
      museumId: pair.museumId,
      museumName: pair.museumName,
      exhibitionId: pair.exhibitionId,
      collectionFile: pair.collectionFile,
      fileExists,
      parseError,
      total,
      missingImage,
      placeholderImage,
      duplicateHeavy,
      missingImageRate: total ? +(missingImage / total).toFixed(4) : 0,
      placeholderRate: total ? +(placeholderImage / total).toFixed(4) : 0,
      duplicateHeavyRate: total ? +(duplicateHeavy / total).toFixed(4) : 0,
    });
  }

  const issues = records.filter((r) =>
    !r.fileExists ||
    r.parseError ||
    r.total === 0 ||
    r.missingImageRate >= 0.3 ||
    r.placeholderRate >= 0.3 ||
    r.duplicateHeavyRate >= 0.4
  );

  const byCountry = {};
  for (const r of issues) {
    if (!byCountry[r.country]) byCountry[r.country] = [];
    byCountry[r.country].push(r);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    exhibitionCount: records.length,
    totalArtworks,
    issueExhibitionCount: issues.length,
    issueMuseumCount: new Set(issues.map((i) => i.museumId)).size,
    thresholds: {
      missingImageRate: 0.3,
      placeholderRate: 0.3,
      duplicateHeavyRate: 0.4,
      duplicateHeavyMinCount: 10,
    },
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify({ summary, issues, byCountry }, null, 2));

  console.log(`Audit saved: ${OUT_FILE}`);
  console.log(`Exhibitions checked: ${summary.exhibitionCount}`);
  console.log(`Total artworks: ${summary.totalArtworks}`);
  console.log(`Issue exhibitions: ${summary.issueExhibitionCount}`);
  console.log(`Issue museums: ${summary.issueMuseumCount}`);
}

main();
