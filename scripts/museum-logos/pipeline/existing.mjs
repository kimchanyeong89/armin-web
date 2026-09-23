// Gather logos already referenced by representativeImage (local files + remote logo URLs).
import fs from 'fs';
const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const res = {};
for (const m of exhibitions) {
  const rep = m.representativeImage || '';
  if (!/logo/i.test(rep)) continue;
  fs.mkdirSync(`existing/${m.id}`, { recursive: true });
  const ext = (rep.split('?')[0].split('.').pop() || 'png').toLowerCase();
  if (/^https?:/.test(rep)) {
    const r = await fetch(rep, { headers: { 'User-Agent': UA } }).catch(e => ({ ok: false, status: String(e) }));
    if (r.ok) { fs.writeFileSync(`existing/${m.id}/rep.${ext}`, Buffer.from(await r.arrayBuffer())); res[m.id] = { rep, file: `rep.${ext}` }; }
    else res[m.id] = { rep, error: r.status };
  } else {
    const p = `/Users/kietzsche/armin-web-main/public/${rep.replace(/^\//, '')}`;
    if (fs.existsSync(p)) { fs.copyFileSync(p, `existing/${m.id}/rep.${ext}`); res[m.id] = { rep, file: `rep.${ext}` }; }
    else res[m.id] = { rep, error: 'missing-local' };
  }
}
fs.writeFileSync('existing/results.json', JSON.stringify(res, null, 1));
const bad = Object.entries(res).filter(([, v]) => v.error);
console.log('existing', Object.keys(res).length, 'failed', bad.length, bad.map(([k, v]) => `${k}:${v.error}`).join(' '));
