import fs from 'fs';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const UA = { 'User-Agent': 'COLLY-museum-logo-audit/1.0 (cykim@crexai.co)' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(url) { for (let i = 0; i < 6; i++) { try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); await sleep(3000 * (i + 1)); } catch { await sleep(3000); } } return null; }
const hav = (a, b, c, d) => { const R = 6371, t = x => x * Math.PI / 180; const dl = t(c - a), dg = t(d - b); const h = Math.sin(dl/2)**2 + Math.cos(t(a))*Math.cos(t(c))*Math.sin(dg/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const vals = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
const norm = s => String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/\b(the|museum|museo|musee|art|of|de|di|du|la|le|des|and|gallery)\b/g,' ').replace(/[^\p{L}\p{N}]+/gu,'');
const w = JSON.parse(fs.readFileSync('wikidata.json', 'utf8'));
const byId = new Map(exhibitions.map(m => [m.id, m]));
for (const rec of w.filter(o => !o.qid)) {
  const m = byId.get(rec.id);
  const queries = [...new Set([m.name, m.name_en, m.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), m.name.split(/[,–—]/)[0].trim(), m.name_ko].filter(Boolean))];
  const seen = new Map();
  for (const q of queries) {
    const lang = /[가-힣]/.test(q) ? 'ko' : 'en';
    const s = await j(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${lang}&uselang=${lang}&type=item&limit=10&format=json`);
    for (const hit of s?.search || []) if (!seen.has(hit.id)) seen.set(hit.id, hit);
    await sleep(400);
  }
  const ids = [...seen.keys()];
  if (!ids.length) { console.log('NOHITS', rec.id, queries); continue; }
  const r = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.slice(0, 45).join('|')}&props=claims|labels|sitelinks&languages=en|ko&format=json`);
  const cands = Object.entries(r?.entities || {}).map(([qid, e]) => {
    let dist = Infinity; for (const c of vals(e, 'P625')) dist = Math.min(dist, hav(m.latitude, m.longitude, c.latitude, c.longitude));
    const labels = [e.labels?.en?.value, e.labels?.ko?.value].filter(Boolean);
    const sim = labels.some(l => norm(l) && (norm(l) === norm(m.name) || norm(l) === norm(m.name_ko) || norm(m.name).includes(norm(l)) || norm(l).includes(norm(m.name))));
    return { qid, label: labels[0] || '', dist, sim, logos: vals(e, 'P154'), icons: vals(e, 'P2910'), small: vals(e, 'P8972'), website: vals(e, 'P856'), enwiki: e.sitelinks?.enwiki?.title || '', kowiki: e.sitelinks?.kowiki?.title || '', rank: ids.indexOf(qid) };
  });
  const ok = cands.filter(c => c.dist <= 10 || (c.sim && c.dist === Infinity) || (c.sim && c.dist <= 25)).sort((a, b) => a.rank - b.rank);
  if (ok[0]) { rec.qid = ok[0].qid; rec.best = ok[0]; rec.retry = true; console.log('OK', rec.id, ok[0].qid, ok[0].label, isFinite(ok[0].dist) ? ok[0].dist.toFixed(1) + 'km' : 'nocoord', 'logos', ok[0].logos.length, 'site', ok[0].website[0] || ''); }
  else console.log('MISS', rec.id, cands.slice(0, 3).map(c => `${c.qid}:${c.label}:${isFinite(c.dist) ? c.dist.toFixed(0) : 'nc'}`).join(' , '));
}
fs.writeFileSync('wikidata.json', JSON.stringify(w, null, 1));
console.log('resolved now', w.filter(o => o.qid).length, 'with logo', w.filter(o => o.best?.logos?.length).length);
