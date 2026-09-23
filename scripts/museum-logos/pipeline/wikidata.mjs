// Resolve each museum to a Wikidata item (name search + coordinate check), collect logo/website claims.
import fs from 'fs';
const S = '/private/tmp/claude-501/-Users-kietzsche-armin-web-main/05be24b5-6b1e-40f7-98f3-75f8d47d8739/scratchpad';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const UA = { 'User-Agent': 'COLLY-museum-logo-audit/1.0 (cykim@crexai.co)' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      return await r.json();
    } catch { await sleep(1500 * (i + 1)); }
  }
  return null;
}
const hav = (a, b, c, d) => { const R = 6371, t = x => x * Math.PI / 180; const dl = t(c - a), dg = t(d - b); const h = Math.sin(dl/2)**2 + Math.cos(t(a))*Math.cos(t(c))*Math.sin(dg/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const vals = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
async function resolve(m) {
  const queries = [...new Set([m.name, m.name_en, m.name.replace(/\s*\(.*?\)\s*/g, ' ').trim(), m.name.split(/[,–—-]/)[0].trim(), m.name_ko].filter(Boolean))];
  const seen = new Map();
  for (const q of queries) {
    for (const lang of (q === m.name_ko ? ['ko'] : ['en'])) {
      const s = await j(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${lang}&uselang=${lang}&type=item&limit=8&format=json`);
      for (const hit of s?.search || []) if (!seen.has(hit.id)) seen.set(hit.id, hit);
    }
    if (seen.size >= 16) break;
  }
  const ids = [...seen.keys()];
  if (!ids.length) return { id: m.id, qid: null };
  const ents = {};
  for (let i = 0; i < ids.length; i += 40) {
    const r = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.slice(i, i + 40).join('|')}&props=claims|labels|sitelinks&languages=en|ko&format=json`);
    Object.assign(ents, r?.entities || {});
  }
  const cands = [];
  for (const [qid, e] of Object.entries(ents)) {
    const coords = vals(e, 'P625');
    let dist = Infinity;
    for (const c of coords) dist = Math.min(dist, hav(m.latitude, m.longitude, c.latitude, c.longitude));
    cands.push({ qid, label: e.labels?.en?.value || e.labels?.ko?.value || '', dist, logos: vals(e, 'P154'), icons: vals(e, 'P2910'), small: vals(e, 'P8972'), website: vals(e, 'P856'), enwiki: e.sitelinks?.enwiki?.title || '', kowiki: e.sitelinks?.kowiki?.title || '', rank: ids.indexOf(qid) });
  }
  const near = cands.filter(c => c.dist <= 3).sort((a, b) => (b.logos.length > 0) - (a.logos.length > 0) || a.rank - b.rank || a.dist - b.dist);
  const best = near[0] || null;
  return { id: m.id, name: m.name, qid: best?.qid || null, best, others: near.slice(1, 4).map(c => ({ qid: c.qid, label: c.label, dist: +c.dist.toFixed(2), logos: c.logos })), nearestFar: best ? null : cands.sort((a,b)=>a.dist-b.dist)[0] || null };
}
const out = [];
let idx = 0;
async function worker() {
  while (idx < exhibitions.length) {
    const m = exhibitions[idx++];
    try { out.push(await resolve(m)); } catch (e) { out.push({ id: m.id, error: String(e) }); }
    if (out.length % 25 === 0) console.log('done', out.length);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
fs.writeFileSync(`${S}/logos/wikidata.json`, JSON.stringify(out, null, 1));
const withQ = out.filter(o => o.qid), withLogo = out.filter(o => o.best?.logos?.length);
console.log('TOTAL', out.length, 'resolved', withQ.length, 'with P154 logo', withLogo.length, 'with website', out.filter(o => o.best?.website?.length).length);
