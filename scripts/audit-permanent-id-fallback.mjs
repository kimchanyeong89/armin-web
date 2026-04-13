import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'public', 'data');
const exhibitionsPath = path.join(root, 'src', 'data', 'exhibitions.js');

const raw = fs.readFileSync(exhibitionsPath, 'utf8');
const match = raw.match(/export const exhibitions\s*=\s*(\[[\s\S]*\]);\s*$/);
if (!match) {
  console.error('Failed to parse exhibitions.js');
  process.exit(1);
}

const exhibitions = Function(`return (${match[1]});`)();
const rows = [];

for (const museum of exhibitions) {
  const perma = Array.isArray(museum?.permanentExhibitions) ? museum.permanentExhibitions : [];
  for (const ex of perma) {
    const exId = String(ex?.id || '').trim();
    const file = String(ex?.collectionFile || '').trim();
    if (!exId || !file) continue;

    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      rows.push({ exId, file, total: 0, awFallbackCount: 0, missingFile: true });
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      rows.push({ exId, file, total: 0, awFallbackCount: 0, parseError: true });
      continue;
    }

    const items = Array.isArray(payload)
      ? payload
      : (payload?.artworks || payload?.objects || payload?.items || payload?.results || []);

    if (!Array.isArray(items) || items.length === 0) {
      rows.push({ exId, file, total: 0, awFallbackCount: 0, empty: true });
      continue;
    }

    let awFallbackCount = 0;
    for (let i = 0; i < items.length; i++) {
      const a = items[i] || {};
      const inv = String(
        a.id || a.objectNumber || a.registrationNumber || a.inventoryNumber || a.accessionNum || `AW-${i}`
      ).trim();
      if (/^AW-\d+$/i.test(inv)) awFallbackCount += 1;
    }

    rows.push({
      exId,
      file,
      total: items.length,
      awFallbackCount,
      awFallbackRatio: Number((awFallbackCount / items.length).toFixed(4)),
    });
  }
}

const risky = rows.filter((r) => !r.missingFile && !r.parseError && r.total > 0 && r.awFallbackCount > 0);
const severe = risky.filter((r) => r.awFallbackRatio >= 0.5);

console.log(JSON.stringify({
  totalPermanentCollections: rows.length,
  riskyCollections: risky.length,
  severeCollections: severe.length,
  topRisky: [...risky].sort((a, b) => b.awFallbackCount - a.awFallbackCount).slice(0, 60),
}, null, 2));
