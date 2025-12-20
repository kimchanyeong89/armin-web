#!/usr/bin/env node
// Parse a saved NPG location HTML file and append items into npg-floor3.json under a given room
const fs = require('fs');
const path = require('path');

function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function extractFromHtml(html) {
  const items = [];
  // naive parsing: find blocks with links to /collections/ and an <img>
  const cardRe = /<a[^>]+href="([^"]*\/collections\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = cardRe.exec(html))) {
    const href = m[1];
    const segment = m[2];
    const imgMatch = segment.match(/<img[^>]+(data-src|src|srcset)="([^"]+)"[^>]*alt="([^"]*)"/i);
    let image = '';
    let alt = '';
    if (imgMatch) {
      image = imgMatch[2];
      alt = imgMatch[3] || '';
    }
    // title: try heading or alt
    const titleMatch = segment.match(/<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/i);
    const title = norm((titleMatch && titleMatch[2]) || alt || 'Artwork');
    // meta block for artist/year
    const metaMatch = segment.match(/<(p|div)[^>]*(artist|creator|meta|details)[^>]*>([\s\S]*?)<\/\1>/i);
    const metaText = norm(metaMatch ? metaMatch[3].replace(/<[^>]+>/g, ' ') : '');
    const yearMatch = metaText.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const artist = metaText.split(/[—|·,]/).map(norm).filter(Boolean)[0] || '';
    items.push({
      id: `npg-offline-${Date.now()}-${items.length}`,
      name: title,
      title,
      artist,
      year,
      date: yearMatch ? yearMatch[0] : '',
      image,
      url: href
    });
  }
  return items;
}

function main() {
  const htmlPath = process.env.HTML || process.argv[2];
  const room = String(process.env.ROOM || process.argv[3] || '1');
  if (!htmlPath || !fs.existsSync(htmlPath)) {
    console.error('Usage: HTML=/abs/path/to/location998.html ROOM=1 node scripts/parse-npg-location-html.cjs');
    process.exit(1);
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const items = extractFromHtml(html);
  console.log(`Extracted ${items.length} items from ${htmlPath}`);

  const outPath = path.join(__dirname, '..', 'public', 'data', 'npg-floor3.json');
  let rooms = [];
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      rooms = Array.isArray(existing.rooms) ? existing.rooms : [];
    } catch {}
  }
  if (rooms.length === 0) {
    rooms = Array.from({ length: 11 }, (_, i) => ({ id: String(i + 1), title: `Room ${i + 1}`, items: [] }));
  }
  const idx = rooms.findIndex(r => r.id === room);
  const prev = idx >= 0 ? rooms[idx] : { id: room, title: `Room ${room}`, items: [] };
  const merged = (prev.items || []).concat(items);
  const seen = new Set();
  const dedup = [];
  for (const it of merged) {
    const key = it.url || `${it.name}-${it.artist}-${it.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(it);
  }
  const updated = { id: room, title: `Room ${room}`, items: dedup };
  if (idx >= 0) rooms[idx] = updated; else rooms.push(updated);
  fs.writeFileSync(outPath, JSON.stringify({ scrapedAt: new Date().toISOString(), source: htmlPath, rooms }, null, 2));
  console.log(`Saved room ${room} with ${updated.items.length} items to ${outPath}`);
}

if (require.main === module) main();
