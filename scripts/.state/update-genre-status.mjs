// Rewrite the ARMIN column of the 9 genre Top-10 tables with a clear 4-state status,
// and recompute each "보유 N/10" header. Run at milestones. Uses split('|') on genre-table
// data rows ONLY (8 fields, col1 = a number) so the bottom tracker + prose are untouched.
//   ✅ 보유 {n}점   — registered in exhibitions.js (we have it)
//   🔄 수집중 n/N   — full scrape in progress (have script + partial data)
//   🔄 수집예정 ~N  — probe viable, scrape queued
//   ❌ 수집불가(사유) — museum site blocked/no-catalogue/etc (can't collect)
//   ⚪ 미시도        — not yet attempted
import fs from 'node:fs';

const DOC = 'GENRE_TOP10_LIST.md';
const P = 'scripts/.state/', D = 'public/data/';
const EX = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const registered = new Set([...EX.matchAll(/\n  \{\n    id: "([^"]+)"/g)].map((m) => m[1]));
const fmt = (n) => (n == null ? '?' : n.toLocaleString('en-US'));

function liveCount(slug) {
  for (const f of [D + slug + '-collection.json', D + slug + '.json']) {
    if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')).artworks.length; } catch {} }
  }
  for (const suf of ['-uploaded.ndjson', '-works.ndjson', '-results.ndjson', '-ok.ndjson']) {
    const f = P + slug + suf;
    if (fs.existsSync(f)) { try { const c = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length; if (c > 0) return c; } catch {} }
  }
  const pf = P + slug + '-progress.json';
  if (fs.existsSync(pf)) { try { const j = JSON.parse(fs.readFileSync(pf, 'utf8')); if (j.works) return Object.values(j.works).filter((w) => w && w.status === 'ok').length; if (j.done) return Object.values(j.done).filter((d) => d && d.s === 'ok').length; } catch {} }
  return null;
}
function gap(slug) { const f = P + 'gap1-results/' + slug + '.json'; if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} } return null; }

// genre-table museum-name substring → gap slug (only for the rows we've worked on)
const NAME2SLUG = [
  ['Fotomuseum Winterthur', 'fotomuseum-winterthur'], ['Tokyo Photographic', 'tokyo-photographic'],
  ['ZKM', 'zkm'], ['Julia Stoschek', 'julia-stoschek'],
  ['Cinémathèque', 'cinematheque-fr'], ['Academy Museum', 'academy-museum'], ['Moving Image', 'momi-ny'],
  ['Deutsche Kinemathek', 'deutsche-kinemathek'], ['BFI', 'bfi'], ['KOFA', 'kofa'], ['NFAJ', 'nfaj'], ['映画アーカイブ', 'nfaj'],
  ['Vitra', 'vitra'], ['Design Museum', 'design-museum-london'], ['Cooper Hewitt', 'cooper-hewitt'],
  ['Designmuseum Danmark', 'designmuseum-dk'], ['Triennale', 'triennale'], ['MAK', 'mak-vienna'],
  ['Morgan Library', 'morgan-library'], ['Kupferstichkabinett', 'kupferstichkabinett'],
  ['Museum für Gestaltung', 'gestaltung-zurich'], ['Wilanów', 'wilanow-poster'], ['Poster House', 'poster-house'],
  ['Moravská', 'moravian-gallery'], ['ginza graphic', 'ggg-tokyo'],
  ['ジブリ', 'ghibli'], ['지브리', 'ghibli'], ['Ghibli', 'ghibli'], ['マンガ', 'kyoto-manga'], ['교토 국제만화', 'kyoto-manga'],
  ['Cité de la BD', 'cibdi-angouleme'], ['CIBDI', 'cibdi-angouleme'], ['Belgian Comic', 'belgian-comic'],
  ['Billy Ireland', 'billy-ireland'], ['Schulz', 'schulz'], ['한국만화박물관', 'korea-manhwa'],
  ['手塚治虫', 'tezuka'], ['데즈카', 'tezuka'], ['Hergé', 'herge'], ['Cartoon Art', 'cartoon-art-sf'],
];

// pre-filter (curl) escalations that never got a gap1-results file — keyed by name substring
const ESCALATED_BY_NAME = [
  ['George Eastman', 'Cloudflare 전면차단'], ['EYE Filmmuseum', '카탈로그 로그인 전용'],
  ['Fotomuseum Winterthur', 'Cloudflare 챌린지'], ['Julia Stoschek', 'Cloudflare 챌린지'],
  ['Moving Image', 'Cloudflare 차단'], ['手塚治虫', '403 차단'], ['데즈카', '403 차단'],
];
function statusFor(slug) {
  if (!slug) return null;
  const n = liveCount(slug), g = gap(slug);
  if (registered.has(slug)) return n != null ? `✅ 보유 ${fmt(n)}점` : `✅ 보유`;
  if (n != null && n >= 15) { const e = g && (g.est_full_count || g.estimated_inscope_count); return `🔄 수집중 ${fmt(n)}/${fmt(e)}`; }
  if (g && g.viable === false) return `❌ 수집불가 (${(g.reason || '').replace(/\s+/g, ' ').slice(0, 36)}…)`;
  if (g && g.viable === true) { const e = g.est_full_count || g.estimated_inscope_count; return `🔄 수집예정 (~${fmt(e)})`; }
  return null;
}

const lines = fs.readFileSync(DOC, 'utf8').split('\n');
let changed = 0;
// pass 1: update ONLY gap/escalated rows; leave registered-base rows (✅ `slug`) untouched.
// This is fully idempotent — gap rows always resolve by name, base rows are never modified.
const rows = lines.map((line) => {
  if (!line.startsWith('| ')) return line;
  const cells = line.split('|');           // genre table: ['', ' # ', ' museum ', ' city ', ' country ', ' continent ', ' ARMIN ', '']
  if (cells.length !== 8) return line;       // tracker rows have 6 fields → skip
  if (!/^\s*\d+\s*$/.test(cells[1])) return line; // header/separator → skip
  const gapHit = NAME2SLUG.find(([name]) => cells[2].includes(name));
  const escHit = ESCALATED_BY_NAME.find(([n]) => cells[2].includes(n));
  if (!gapHit && !escHit) return line;       // base row (not a gap target) → leave as-is
  let st = gapHit ? statusFor(gapHit[1]) : null;
  if (!st) st = escHit ? `❌ 수집불가 (${escHit[1]})` : '⚪ 미시도';
  if (cells[6] !== ' ' + st + ' ') changed++;
  cells[6] = ' ' + st + ' ';
  return cells.join('|');
});

// pass 2: recompute "보유 N/10" header — count any ✅ in each genre's 10 rows
let curHeaderIdx = -1, held = 0;
for (let i = 0; i < rows.length; i++) {
  const h = rows[i].match(/^## .+?— 보유 \d+\/10/);
  if (h) {
    if (curHeaderIdx >= 0) rows[curHeaderIdx] = rows[curHeaderIdx].replace(/보유 \d+\/10/, `보유 ${held}/10`);
    curHeaderIdx = i; held = 0; continue;
  }
  if (curHeaderIdx >= 0 && rows[i].startsWith('| ') && rows[i].split('|').length === 8 && /^\s*\d+\s*$/.test(rows[i].split('|')[1]) && rows[i].split('|')[6].includes('✅')) held++;
}
if (curHeaderIdx >= 0) rows[curHeaderIdx] = rows[curHeaderIdx].replace(/보유 \d+\/10/, `보유 ${held}/10`);

fs.writeFileSync(DOC, rows.join('\n'));
console.log(`genre tables: ${changed} ARMIN cells updated`);
