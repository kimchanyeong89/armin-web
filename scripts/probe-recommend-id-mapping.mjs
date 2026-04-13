import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'public', 'data');
const exhibitionsPath = path.join(root, 'src', 'data', 'exhibitions.js');
const WORKER = 'https://armin-semantic-search.armin-art.workers.dev';

const raw = fs.readFileSync(exhibitionsPath, 'utf8');
const match = raw.match(/export const exhibitions\s*=\s*(\[[\s\S]*\]);\s*$/);
if (!match) {
  throw new Error('Failed to parse exhibitions.js');
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
    if (!fs.existsSync(filePath)) continue;

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    const items = Array.isArray(payload)
      ? payload
      : (payload?.artworks || payload?.objects || payload?.items || payload?.results || []);
    if (!Array.isArray(items) || items.length === 0) continue;

    // Same fallback rule as current InteractiveGlobeRealModal inventoryNo mapping.
    let awFallbackCount = 0;
    for (let i = 0; i < items.length; i++) {
      const a = items[i] || {};
      const inv = String(
        a.id || a.objectNumber || a.registrationNumber || a.inventoryNumber || a.accessionNum || `AW-${i}`
      ).trim();
      if (/^AW-\d+$/i.test(inv)) awFallbackCount += 1;
    }

    if (awFallbackCount > 0) {
      rows.push({ exId, file, total: items.length, awFallbackCount });
    }
  }
}

const risky = rows.sort((a, b) => b.awFallbackCount - a.awFallbackCount).slice(0, 20);

async function checkIds(ids) {
  const res = await fetch(`${WORKER}/check-ids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, count: 0, foundIds: [] };
  }
  const data = await res.json();
  return {
    ok: true,
    count: Number(data?.count || 0),
    foundIds: Array.isArray(data?.foundIds) ? data.foundIds : [],
  };
}

const sampleIdx = [0, 1, 2, 3, 4, 5, 8, 13, 21, 34, 55, 89, 144, 233].filter((n, i, arr) => arr.indexOf(n) === i);

const results = [];
for (const row of risky) {
  const oldIds = sampleIdx.map((i) => `AW-${i}`);
  const canonIds = sampleIdx.map((i) => `${row.exId}-${i}`);

  const oldCheck = await checkIds(oldIds);
  const canonCheck = await checkIds(canonIds);

  results.push({
    exId: row.exId,
    file: row.file,
    total: row.total,
    awFallbackCount: row.awFallbackCount,
    oldCheck,
    canonCheck,
  });
}

console.log(JSON.stringify({ checked: results.length, results }, null, 2));
