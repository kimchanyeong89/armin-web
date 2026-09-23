// Contact sheet: rows of labelled tiles. Input JSON: [{label, sub, files:[{path, note, dark}]}]. Output PNG.
// dark:true tiles sit on the app's #080808 ground so white-ink previews read the way they will in the modal.
import fs from 'fs';
import sharp from 'sharp';

const [, , inJson, outPng, colsArg] = process.argv;
const rows = JSON.parse(fs.readFileSync(inJson, 'utf8'));
const TW = 300, TH = 120, LABEL = 230, PAD = 8, NOTE = 16;
const cols = Number(colsArg || 5);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function tile(p, ground) {
  try {
    const img = sharp(fs.readFileSync(p), { density: 300, limitInputPixels: false, animated: false });
    const meta = await img.metadata();
    const buf = await img.flatten({ background: ground }).resize(TW - 12, TH - 12, { fit: 'inside' }).png().toBuffer();
    return { buf, meta };
  } catch (e) {
    return { buf: null, meta: null, err: String(e.message).slice(0, 40) };
  }
}

const height = rows.length * (TH + NOTE + PAD) + PAD;
const width = LABEL + cols * (TW + PAD) + PAD;
const comps = [];
let svgText = '';
for (let r = 0; r < rows.length; r++) {
  const y = PAD + r * (TH + NOTE + PAD);
  svgText += `<text x="8" y="${y + 18}" font-size="14" font-family="Helvetica" font-weight="bold" fill="#111">${esc(rows[r].label).slice(0, 30)}</text>`;
  if (rows[r].sub) svgText += `<text x="8" y="${y + 38}" font-size="11" font-family="Helvetica" fill="#444">${esc(rows[r].sub).slice(0, 34)}</text>`;
  const files = rows[r].files.slice(0, cols);
  for (let c = 0; c < files.length; c++) {
    const x = LABEL + PAD + c * (TW + PAD);
    const ground = files[c].dark ? '#080808' : '#d9d9d9';
    const t = await tile(files[c].path, ground);
    svgText += `<rect x="${x}" y="${y}" width="${TW}" height="${TH}" fill="${ground}"/>`;
    if (t.buf) {
      const m = await sharp(t.buf).metadata();
      comps.push({ input: t.buf, left: x + Math.round((TW - m.width) / 2), top: y + Math.round((TH - m.height) / 2) });
    }
    const dims = t.meta ? `${t.meta.format} ${t.meta.width}x${t.meta.height}` : `ERR ${t.err}`;
    svgText += `<text x="${x + 2}" y="${y + TH + 13}" font-size="11" font-family="Helvetica" fill="#222">${esc(`${c}: ${files[c].note || ''} ${files[c].dark ? '' : dims}`).slice(0, 52)}</text>`;
  }
}
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f7f7f7"/>${svgText}</svg>`);
await sharp(bg).composite(comps).png().toFile(outPng);
console.log('wrote', outPng, width, height);
