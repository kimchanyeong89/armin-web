// Third pass for still-unresolved museums: full-text search on Wikidata + en.wikipedia (pageprops → QID).
import fs from 'fs';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const UA = { 'User-Agent': 'COLLY-museum-logo-audit/1.0 (cykim@crexai.co)' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(url) { for (let i = 0; i < 6; i++) { try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); await sleep(2500 * (i + 1)); } catch { await sleep(2500); } } return null; }
const hav = (a, b, c, d) => { const R = 6371, t = x => x * Math.PI / 180; const dl = t(c - a), dg = t(d - b); const h = Math.sin(dl/2)**2 + Math.cos(t(a))*Math.cos(t(c))*Math.sin(dg/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const vals = (e, p) => (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(Boolean);
const w = JSON.parse(fs.readFileSync('wikidata.json', 'utf8'));
const byId = new Map(exhibitions.map(m => [m.id, m]));
const hints = { 'musee-chagall': 'Musée national Marc Chagall Nice', staatsgalerien: 'Bavarian State Painting Collections', 'museu-picasso-barcelona': 'Museu Picasso Barcelona', 'dali-foundation': 'Dalí Theatre-Museum Figueres', 'mnba-habana': 'Museo Nacional de Bellas Artes de La Habana', 'albertina-museum': 'Albertina Vienna museum', 'kiasma-collection': 'Kiasma museum Helsinki', 'state-russian-museum': 'State Russian Museum Saint Petersburg', 'soam-memorial-hall': '소암기념관 서귀포', dumoak: '김영갑갤러리두모악', 'kim-tschang-yeul-art-museum': 'Kim Tschang-yeul Art Museum Jeju', qagoma: 'Queensland Art Gallery', apma: 'Amorepacific Museum of Art', 'hangaram-art-museum': 'Hangaram Art Museum Seoul Arts Center', groundseesaw: 'Ground Seesaw Seoul', 'jeju-contemporary-art-museum': 'Jeju Museum of Contemporary Art', 'foam-amsterdam': 'Foam Fotografiemuseum Amsterdam', 'ars-electronica': 'Ars Electronica Center Linz', 'momas-saitama': 'Museum of Modern Art Saitama' };
for (const rec of w.filter(o => !o.qid)) {
  const m = byId.get(rec.id);
  const q = hints[rec.id] || m.name;
  const ids = new Set();
  const wd = await j(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=10&format=json`);
  for (const h of wd?.query?.search || []) ids.add(h.title);
  for (const wiki of ['en', 'ko']) {
    const ws = await j(`https://${wiki}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=5&prop=pageprops&ppprop=wikibase_item&format=json`);
    for (const p of Object.values(ws?.query?.pages || {})) if (p.pageprops?.wikibase_item) ids.add(p.pageprops.wikibase_item);
  }
  const list = [...ids].filter(x => /^Q\d+$/.test(x));
  if (!list.length) { console.log('NOHITS', rec.id, q); continue; }
  const r = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${list.slice(0, 45).join('|')}&props=claims|labels|sitelinks&languages=en|ko&format=json`);
  const cands = Object.entries(r?.entities || {}).map(([qid, e]) => {
    let dist = Infinity; for (const c of vals(e, 'P625')) dist = Math.min(dist, hav(m.latitude, m.longitude, c.latitude, c.longitude));
    return { qid, label: e.labels?.en?.value || e.labels?.ko?.value || '', dist, logos: vals(e, 'P154'), icons: vals(e, 'P2910'), small: vals(e, 'P8972'), website: vals(e, 'P856'), enwiki: e.sitelinks?.enwiki?.title || '', kowiki: e.sitelinks?.kowiki?.title || '', rank: list.indexOf(qid) };
  });
  console.log('CANDS', rec.id, '::', cands.sort((a,b)=>a.dist-b.dist).slice(0, 5).map(c => `${c.qid}|${c.label}|${isFinite(c.dist) ? c.dist.toFixed(1) + 'km' : 'nc'}|logo${c.logos.length}|${c.website[0] || ''}`).join('  ;  '));
  const near = cands.filter(c => c.dist <= 10).sort((a, b) => a.dist - b.dist);
  if (near[0]) { rec.qid = near[0].qid; rec.best = near[0]; rec.retry2 = true; }
  await sleep(300);
}
fs.writeFileSync('wikidata.json', JSON.stringify(w, null, 1));
console.log('resolved now', w.filter(o => o.qid).length, 'with logo', w.filter(o => o.best?.logos?.length).length, 'still missing', w.filter(o => !o.qid).map(o => o.id).join(','));
