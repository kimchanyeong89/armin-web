// Final check: every published logo as it will look in dark mode, 6 per row, labelled by museum id.
import fs from 'fs';
import { execFileSync } from 'child_process';
import { darkPreview } from './preview.mjs';

const REPO = '/Users/kietzsche/armin-web-main';
const manifest = JSON.parse(fs.readFileSync(`${REPO}/src/data/museumLogos.json`, 'utf8'));
const ids = Object.keys(manifest).sort();
fs.mkdirSync('gallery', { recursive: true });
const rows = [];
for (let i = 0; i < ids.length; i += 6) {
  const files = [];
  for (const id of ids.slice(i, i + 6)) {
    const out = `gallery/${id}.png`;
    await darkPreview(`${REPO}/public${manifest[id].src}`, out);
    files.push({ path: out, note: `${id.slice(0, 30)} ${manifest[id].w}`, dark: true });
  }
  rows.push({ label: `${i + 1}–${Math.min(i + 6, ids.length)}`, files });
}
const PER = 17;
for (let p = 0; p * PER < rows.length; p++) {
  fs.writeFileSync(`gallery/page-${p}.json`, JSON.stringify(rows.slice(p * PER, (p + 1) * PER)));
  execFileSync('node', ['sheet.mjs', `gallery/page-${p}.json`, `gallery/page-${p}.png`, '6']);
  console.log(`gallery/page-${p}.png`);
}
