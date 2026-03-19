const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const OUT_FILE = path.join(DATA_DIR, 'image-connectivity-sample.json');
const exhibitions = require(path.join(ROOT, 'src', 'data', 'exhibitions.js')).exhibitions || [];

function toItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const keys = ['items', 'artworks', 'objects', 'data', 'results', 'list', 'records', 'collection'];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (Array.isArray(payload.rooms)) {
    const merged = [];
    for (const room of payload.rooms) {
      if (room && Array.isArray(room.artworks)) merged.push(...room.artworks);
    }
    return merged;
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

async function probeUrl(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      }
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name || 'error' };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const report = [];
  let checked = 0;
  let okCount = 0;

  for (const museum of exhibitions) {
    const permanent = Array.isArray(museum.permanentExhibitions) ? museum.permanentExhibitions : [];
    for (const ex of permanent) {
      if (!ex?.collectionFile) continue;
      const filePath = path.join(DATA_DIR, ex.collectionFile);
      if (!fs.existsSync(filePath)) {
        report.push({
          country: museum.country || 'Unknown',
          museumId: museum.id,
          museumName: museum.name,
          exhibitionId: ex.id,
          collectionFile: ex.collectionFile,
          sampleCount: 0,
          okCount: 0,
          successRate: 0,
          note: 'missing-file'
        });
        continue;
      }

      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        report.push({
          country: museum.country || 'Unknown',
          museumId: museum.id,
          museumName: museum.name,
          exhibitionId: ex.id,
          collectionFile: ex.collectionFile,
          sampleCount: 0,
          okCount: 0,
          successRate: 0,
          note: 'parse-error'
        });
        continue;
      }

      const items = toItems(payload);
      const urls = [];
      for (const item of items) {
        const imageUrl = getImageUrl(item);
        if (imageUrl) urls.push(imageUrl);
        if (urls.length >= 2) break;
      }

      if (urls.length === 0) {
        report.push({
          country: museum.country || 'Unknown',
          museumId: museum.id,
          museumName: museum.name,
          exhibitionId: ex.id,
          collectionFile: ex.collectionFile,
          sampleCount: 0,
          okCount: 0,
          successRate: 0,
          note: 'no-image-sample'
        });
        continue;
      }

      let exhibitionOk = 0;
      for (const url of urls) {
        const result = await probeUrl(url, 10000);
        checked += 1;
        if (result.ok) {
          okCount += 1;
          exhibitionOk += 1;
        }
      }

      report.push({
        country: museum.country || 'Unknown',
        museumId: museum.id,
        museumName: museum.name,
        exhibitionId: ex.id,
        collectionFile: ex.collectionFile,
        sampleCount: urls.length,
        okCount: exhibitionOk,
        successRate: +(exhibitionOk / urls.length).toFixed(2)
      });
    }
  }

  const problematic = report.filter((r) => r.sampleCount === 0 || r.successRate < 1);
  const result = {
    generatedAt: new Date().toISOString(),
    summary: {
      exhibitionsChecked: report.length,
      urlsChecked: checked,
      urlsOk: okCount,
      globalSuccessRate: checked ? +(okCount / checked).toFixed(4) : 0,
      problematicExhibitions: problematic.length,
    },
    problematic,
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.summary, null, 2));
}

main();
