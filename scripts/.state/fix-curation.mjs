// Three live-data fixes the user found in the app:
//  ① Ashmolean: remove the 49 portrait miniatures the medium-heuristic missed
//     (category=painting + medium ivory/enamel/vellum/tortoiseshell/miniature). Merge into the
//     existing .miniatures-removed.json backup so --restore still works.
//  ③ Folkwang: remove artifact-reproduction photos (Léon Vidal) + B&W documentary (Jürgen
//     Heinemann) → new .curated-removed.json backup. Keeps the art photography + prints/drawings.
// (② Fitzwilliam city/coords is an exhibitions.js edit, done separately.)
import fs from 'node:fs';

function loadColl(slug) {
  const p = `public/data/${slug}-collection.json`;
  return { p, j: JSON.parse(fs.readFileSync(p, 'utf8')) };
}
function mergeBackup(path, removed) {
  let prev = [];
  if (fs.existsSync(path)) { try { prev = JSON.parse(fs.readFileSync(path, 'utf8')).artworks || []; } catch {} }
  const seen = new Set(prev.map((a) => a.id));
  const merged = prev.concat(removed.filter((a) => !seen.has(a.id)));
  fs.writeFileSync(path, JSON.stringify({ artworks: merged }, null, 2));
}

// ① Ashmolean miniatures
{
  const { p, j } = loadColl('ashmolean');
  const isMini = (x) => String(x.category).toLowerCase() === 'painting'
    && /\b(ivory|enamel|vellum|tortoiseshell|miniature)\b/i.test(x.medium || '')
    && !/vellum\s+paper/i.test(x.medium || '');
  const removed = j.artworks.filter(isMini);
  j.artworks = j.artworks.filter((x) => !isMini(x));
  if (j.total_count != null) j.total_count = j.artworks.length;
  mergeBackup(p.replace(/\.json$/, '.miniatures-removed.json'), removed);
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`① ashmolean: removed ${removed.length} miniatures → ${j.artworks.length} kept`);
}

// ③ Folkwang artifact + B&W documentary photos
{
  const { p, j } = loadColl('folkwang');
  const isJunk = (x) => /l[ée]on\s+vidal/i.test(x.artist || '') || /j[üu]rgen\s+heinemann/i.test(x.artist || '');
  const removed = j.artworks.filter(isJunk);
  const byArtist = removed.reduce((m, x) => { const k = /vidal/i.test(x.artist) ? 'Vidal(유물)' : 'Heinemann(흑백다큐)'; m[k] = (m[k] || 0) + 1; return m; }, {});
  j.artworks = j.artworks.filter((x) => !isJunk(x));
  if (j.total_count != null) j.total_count = j.artworks.length;
  fs.writeFileSync(p.replace(/\.json$/, '.curated-removed.json'), JSON.stringify({ artworks: removed }, null, 2));
  fs.writeFileSync(p, JSON.stringify(j, null, 2));
  console.log(`③ folkwang: removed ${removed.length} (${JSON.stringify(byArtist)}) → ${j.artworks.length} kept`);
}
