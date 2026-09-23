// Download original Commons files for Wikidata P154 (logo) / P8972 (small logo) claims.
import fs from 'fs';
const UA = { 'User-Agent': 'COLLY-museum-logo-audit/1.0 (cykim@crexai.co)' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const w = JSON.parse(fs.readFileSync('wikidata.json', 'utf8'));
const out = {};
for (const o of w) {
  const files = [...(o.best?.logos || []).map(f => ['logo', f]), ...(o.best?.small || []).map(f => ['small', f])];
  if (!files.length) continue;
  fs.mkdirSync(`commons/${o.id}`, { recursive: true });
  out[o.id] = [];
  for (let i = 0; i < files.length; i++) {
    const [kind, name] = files[i];
    const info = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + name)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json`, { headers: UA })).json().catch(() => null);
    const ii = Object.values(info?.query?.pages || {})[0]?.imageinfo?.[0];
    if (!ii) { out[o.id].push({ kind, name, error: 'noinfo' }); continue; }
    const ext = (name.split('.').pop() || 'bin').toLowerCase();
    let ok = false;
    for (let t = 0; t < 4 && !ok; t++) {
      const r = await fetch(ii.url, { headers: UA }).catch(() => null);
      if (r?.ok) { fs.writeFileSync(`commons/${o.id}/${i}-${kind}.${ext}`, Buffer.from(await r.arrayBuffer())); ok = true; }
      else await sleep(3000 * (t + 1));
    }
    out[o.id].push({ kind, name, url: ii.url, w: ii.width, h: ii.height, mime: ii.mime, license: ii.extmetadata?.LicenseShortName?.value || '', file: ok ? `${i}-${kind}.${ext}` : null });
    await sleep(700);
  }
  console.log(o.id, out[o.id].map(x => `${x.kind}:${x.mime}:${x.w}x${x.h}:${x.license}`).join(' '));
}
fs.writeFileSync('commons/results.json', JSON.stringify(out, null, 1));
console.log('DONE', Object.keys(out).length);
