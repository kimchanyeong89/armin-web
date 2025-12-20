#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function normItem(it) {
  return {
    id: it.id || `npg-import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: it.name || it.title || 'Artwork',
    title: it.title || it.name || 'Artwork',
    artist: it.artist || '',
    year: typeof it.year === 'number' ? it.year : null,
    date: it.date || '',
    image: it.image || '',
    url: it.url || ''
  };
}

function main() {
  const dir = process.env.DIR || process.argv[2];
  const room = String(process.env.ROOM || process.argv[3] || '1');
  if (!dir || !fs.existsSync(dir)) {
    console.error('Usage: DIR=/abs/path/to/json-dumps ROOM=1 node scripts/import-npg-json.cjs');
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('No .json files found in', dir);
    process.exit(1);
  }
  let collected = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const data = loadJson(full);
    if (!data) continue;
    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    collected.push(...items.map(normItem));
  }
  // Dedup by URL or title-artist-year
  const seen = new Set();
  const dedup = [];
  for (const it of collected) {
    const key = it.url || `${it.title}-${it.artist}-${it.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(it);
  }
  const outPath = path.join(__dirname, '..', 'public', 'data', 'npg-floor3.json');
  let rooms = [];
  if (fs.existsSync(outPath)) {
    try { const existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); rooms = existing.rooms || []; } catch {}
  }
  if (rooms.length === 0) rooms = Array.from({ length: 11 }, (_, i) => ({ id: String(i + 1), title: `Room ${i + 1}`, items: [] }));
  const idx = rooms.findIndex(r => r.id === room);
  const prev = idx >= 0 ? rooms[idx] : { id: room, title: `Room ${room}`, items: [] };
  const merged = [...(prev.items || []), ...dedup];
  const seen2 = new Set();
  const dedup2 = [];
  for (const it of merged) {
    const key = it.url || `${it.title}-${it.artist}-${it.year}`;
    if (seen2.has(key)) continue;
    seen2.add(key);
    dedup2.push(it);
  }
  const updated = { id: room, title: `Room ${room}`, items: dedup2 };
  if (idx >= 0) rooms[idx] = updated; else rooms.push(updated);
  fs.writeFileSync(outPath, JSON.stringify({ scrapedAt: new Date().toISOString(), source: dir, rooms }, null, 2));
  console.log(`Imported ${dedup.length} items, room ${room} now has ${updated.items.length} items. Wrote ${outPath}`);
}

if (require.main === module) main();
