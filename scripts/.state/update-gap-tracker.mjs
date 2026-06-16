// Refresh the "🎯 갭 수집 트래커" table in GENRE_TOP10_LIST.md with n/n collection status.
// Not real-time — run this at milestones to snapshot progress. Reads the best-available
// "collected so far" signal per slug (final JSON > uploaded/works ndjson > progress.json),
// the estimate from gap1-results, and whether the museum is registered in exhibitions.js.
import fs from 'node:fs';

const DOC = 'GENRE_TOP10_LIST.md';
const P = 'scripts/.state/', D = 'public/data/';
const EX = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const registered = new Set([...EX.matchAll(/\n  \{\n    id: "([^"]+)"/g)].map((m) => m[1]));
const fmt = (n) => (n == null ? '?' : n.toLocaleString('en-US'));

function collected(slug) {
  if (fs.existsSync(D + slug + '-collection.json')) {
    try { return JSON.parse(fs.readFileSync(D + slug + '-collection.json', 'utf8')).artworks.length; } catch {}
  }
  for (const suf of ['-uploaded.ndjson', '-works.ndjson', '-results.ndjson', '-ok.ndjson', '-done.ndjson']) {
    const f = P + slug + suf;
    if (fs.existsSync(f)) { try { const c = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length; if (c > 0) return c; } catch {} }
  }
  const pf = P + slug + '-progress.json';
  if (fs.existsSync(pf)) {
    try {
      const j = JSON.parse(fs.readFileSync(pf, 'utf8'));
      if (j.works) return Object.values(j.works).filter((w) => w && w.status === 'ok').length;
      if (j.done) return Object.values(j.done).filter((d) => d && d.s === 'ok').length;
      if (typeof j.okCount === 'number') return j.okCount;
      if (typeof j.ok === 'number') return j.ok;
      if (Array.isArray(j.uploaded)) return j.uploaded.length;
    } catch {}
  }
  return null;
}
function estimate(slug) {
  const f = P + 'gap1-results/' + slug + '.json';
  if (fs.existsSync(f)) { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return d.est_full_count || d.estimated_inscope_count || null; } catch {} }
  return null;
}
// viable:false from an agent probe → escalation note (first sentence of reason)
function escalatedReason(slug) {
  const f = P + 'gap1-results/' + slug + '.json';
  if (fs.existsSync(f)) { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (d.viable === false) return (d.reason || '').split(/(?<=[.。])\s|;|—/)[0].slice(0, 95).trim(); } catch {} }
  return null;
}

const lines = fs.readFileSync(DOC, 'utf8').split('\n');
let touched = 0;
const out = lines.map((line) => {
  const m = line.match(/^\| `([a-z0-9-]+)` \|/);
  if (!m) return line;
  const slug = m[1];
  const cells = line.split('|');
  if (cells.length < 6) return line;
  const cur = cells[4];
  const n = collected(slug), e = estimate(slug), esc = escalatedReason(slug);
  // pre-filter escalated (no agent result file) → leave the existing reason intact
  if (/escalated/.test(cur) && n == null && !esc) return line;
  let status;
  if (registered.has(slug) && n != null) status = ` ✅ merged **${fmt(n)}**점 `;
  else if (n != null && n >= 15) status = ` 🔄 수집중 **${fmt(n)}**/${fmt(e)} `;
  else if (esc) status = ` ❌ escalated — ${esc} `;
  else if (e != null) status = ` 🔄 스크립트 준비 (예상 ${fmt(e)}) `;
  else return line; // queued/unprobed — keep existing cell
  if (status !== cur) touched++;
  cells[4] = status;
  return cells.join('|');
});
fs.writeFileSync(DOC, out.join('\n'));
console.log(`tracker updated — ${touched} rows changed`);
