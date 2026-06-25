// Second curation pass from the user's app review:
//  ③ Walker: remove artist books (dimensions/title/medium contains "book")
//  ④ ICP: keep only photographs ≥1920 (remove pre-1920 photos)
//  ⑦ Ashmolean: remove the remaining portrait miniatures — small paintings (category=painting,
//     max-dim ≤ 12cm). A painting that small is a miniature regardless of its support medium.
//  ⑧ Folkwang: same ≥1920 rule for its photographs
import fs from 'node:fs';
const maxCm = (s) => { const n = [...(s || '').matchAll(/([\d.]+)\s*cm/g)].map((m) => +m[1]); return n.length ? Math.max(...n) : null; };
const yearOf = (x) => { const m = String(x.year ?? x.date ?? '').match(/\d{4}/); return m ? +m[0] : null; };
function curate(slug, pred, backupSuffix) {
  const p = `public/data/${slug}-collection.json`;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const removed = j.artworks.filter(pred);
  j.artworks = j.artworks.filter((x) => !pred(x));
  if (j.total_count != null) j.total_count = j.artworks.length;
  // merge into existing backup if present (keeps --restore complete)
  const bpath = p.replace(/\.json$/, backupSuffix);
  let prev = [];
  if (fs.existsSync(bpath)) { try { prev = JSON.parse(fs.readFileSync(bpath, 'utf8')).artworks || []; } catch {} }
  const seen = new Set(prev.map((a) => a.id));
  fs.writeFileSync(bpath, JSON.stringify({ artworks: prev.concat(removed.filter((a) => !seen.has(a.id))) }, null, 2));
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  return { removed: removed.length, kept: j.artworks.length };
}

// ③ Walker books
{
  const r = curate('walker-art-center',
    (x) => /\bbook\b/i.test(`${x.dimensions || ''} ${x.title || ''} ${x.medium || ''}`),
    '.books-removed.json');
  console.log(`③ walker: removed ${r.removed} books → ${r.kept} kept`);
}
// ④ ICP pre-1920 photos
{
  const r = curate('icp-ny',
    (x) => x.category === 'photograph' && (yearOf(x) != null && yearOf(x) < 1920),
    '.pre1920-removed.json');
  console.log(`④ icp-ny: removed ${r.removed} pre-1920 photos → ${r.kept} kept`);
}
// ⑦ Ashmolean small paintings (miniatures, ≤12cm)
{
  const r = curate('ashmolean',
    (x) => String(x.category).toLowerCase() === 'painting' && maxCm(x.dimensions) != null && maxCm(x.dimensions) <= 12,
    '.miniatures-removed.json');
  console.log(`⑦ ashmolean: removed ${r.removed} small-paintings(minis) → ${r.kept} kept`);
}
// ⑧ Folkwang pre-1920 photos
{
  const r = curate('folkwang',
    (x) => x.category === 'photograph' && (yearOf(x) != null && yearOf(x) < 1920),
    '.curated-removed.json');
  console.log(`⑧ folkwang: removed ${r.removed} pre-1920 photos → ${r.kept} kept`);
}
