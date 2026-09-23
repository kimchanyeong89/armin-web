// Free extra candidates for the unresolved museums (no model usage):
//   1) Wikimedia Commons file search "<name> logo"
//   2) logo images used on the museum's Wikipedia pages (every language sitelink)
//   3) worldvectorlogo.com slug guesses
// Output: commons-search/<id>/<n>-<source>.<ext> and commons-search/results.json {id: [{file, url, note}]}
import fs from 'fs';

const UA = { 'User-Agent': 'COLLY-museum-logo-audit/1.0 (cykim@crexai.co)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = JSON.parse(fs.readFileSync('manual-list.json', 'utf8'));
const wd = new Map(JSON.parse(fs.readFileSync('wikidata.json', 'utf8')).map((o) => [o.id, o]));
const GENERIC = new Set(['museum', 'museo', 'musee', 'museu', 'muzeum', 'gallery', 'galleria', 'galerie', 'national', 'nazionale', 'nacional', 'national', 'art', 'arts', 'fine', 'modern', 'contemporary', 'the', 'of', 'and', 'de', 'di', 'del', 'des', 'du', 'la', 'le', 'des', 'center', 'centre', 'collection', 'foundation', 'fondation', 'fundacion', 'kunst', 'state', 'city', 'memorial', 'hall', 'institute']);
const tokens = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !GENERIC.has(t));

async function j(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); if (r.status !== 429) return null; } catch {}
    await sleep(2500 * (i + 1));
  }
  return null;
}
async function download(url, dest) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 300) { fs.writeFileSync(dest, b); return true; } return false; }
      if (r.status === 404) return false;
    } catch {}
    await sleep(2000 * (i + 1));
  }
  return false;
}
async function commonsInfo(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 20) {
    const r = await j(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.slice(i, i + 20).join('|'))}&prop=imageinfo&iiprop=url|size|mime&format=json`);
    for (const p of Object.values(r?.query?.pages || {})) if (p.imageinfo?.[0]) out.push({ title: p.title, ...p.imageinfo[0] });
  }
  return out;
}

const results = fs.existsSync('commons-search/results.json') ? JSON.parse(fs.readFileSync('commons-search/results.json', 'utf8')) : {};
fs.mkdirSync('commons-search', { recursive: true });
for (const m of list) {
  if (results[m.id]) continue;
  const w = wd.get(m.id);
  const nameToks = new Set([...tokens(m.name), ...tokens(w?.best?.label), ...tokens(m.id.replace(/-/g, ' '))]);
  const relevant = (title) => { const t = title.toLowerCase(); return /logo|wordmark|signet|emblem/.test(t) && [...nameToks].some((k) => t.includes(k)); };
  const found = new Map(); // url -> {title, note, mime, width}

  // 1) Commons search
  for (const q of [`${m.name} logo`, w?.best?.label && w.best.label !== m.name ? `${w.best.label} logo` : null].filter(Boolean)) {
    const s = await j(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=15&srsearch=${encodeURIComponent(q)}&format=json`);
    const titles = (s?.query?.search || []).map((x) => x.title).filter(relevant);
    for (const info of await commonsInfo(titles)) found.set(info.url, { note: `commons-search:${info.title}`, mime: info.mime, width: info.width });
    await sleep(300);
  }
  // 2) Wikipedia pages in every language that has a sitelink
  if (w?.qid) {
    const e = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${w.qid}&props=sitelinks&format=json`);
    const links = Object.entries(e?.entities?.[w.qid]?.sitelinks || {}).filter(([k]) => /^[a-z]{2,3}wiki$/.test(k) && k !== 'commonswiki').slice(0, 12);
    for (const [site, { title }] of links) {
      const lang = site.replace(/wiki$/, '');
      const p = await j(`https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=images&format=json`);
      // Same name check as the Commons search, and never the sister-project badges every article carries.
      const WIKI_UI = /^(wiki(data|media|quote|source|species|books|news|voyage|versity|pedia)|commons|wiktionary|notification-icon|oojs|mediawiki|red_pog|symbol_)/i;
      const imgs = (p?.parse?.images || []).filter((n) => !WIKI_UI.test(n) && relevant(n.replace(/_/g, ' '))).map((n) => `File:${n}`);
      if (!imgs.length) continue;
      const infos = await commonsInfo(imgs);
      for (const info of infos) found.set(info.url, { note: `${lang}wiki:${info.title}`, mime: info.mime, width: info.width });
      if (!infos.length) {
        for (const n of imgs.slice(0, 3)) {
          const r = await j(`https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(n)}&prop=imageinfo&iiprop=url|size|mime&format=json`);
          const ii = Object.values(r?.query?.pages || {})[0]?.imageinfo?.[0];
          if (ii) found.set(ii.url, { note: `${lang}wiki-local:${n}`, mime: ii.mime, width: ii.width });
        }
      }
      await sleep(200);
    }
  }
  // 3) worldvectorlogo slug guesses
  const base = m.name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const slug of [...new Set([base, base.replace(/^the-/, ''), `${base}-1`, `${base}-logo`])]) {
    const url = `https://cdn.worldvectorlogo.com/logos/${slug}.svg`;
    try { const r = await fetch(url, { method: 'HEAD', headers: UA, signal: AbortSignal.timeout(10000) }); if (r.ok) found.set(url, { note: `worldvectorlogo:${slug}`, mime: 'image/svg+xml' }); } catch {}
  }

  // keep vectors first, then the widest rasters; skip tiny rasters
  const ranked = [...found.entries()].filter(([, v]) => /svg/.test(v.mime || '') || (v.width || 0) >= 500)
    .sort((a, b) => (/svg/.test(b[1].mime) - /svg/.test(a[1].mime)) || (b[1].width || 0) - (a[1].width || 0)).slice(0, 4);
  results[m.id] = [];
  if (ranked.length) fs.mkdirSync(`commons-search/${m.id}`, { recursive: true });
  for (let i = 0; i < ranked.length; i++) {
    const [url, v] = ranked[i];
    const ext = (url.split('?')[0].split('.').pop() || 'png').toLowerCase().slice(0, 4);
    const file = `commons-search/${m.id}/${i}-${v.note.split(':')[0]}.${ext}`;
    if (await download(url, file)) results[m.id].push({ file, url, note: v.note });
  }
  fs.writeFileSync('commons-search/results.json', JSON.stringify(results, null, 1));
  console.log(m.id, results[m.id].map((x) => x.note).join(' | ') || '-');
}
console.log('DONE', Object.values(results).filter((v) => v.length).length, 'museums with extra candidates of', list.length);
