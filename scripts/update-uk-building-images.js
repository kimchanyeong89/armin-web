import got from 'got';
import { writeFile, readFile, writeFile as writeFileCb } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGETS = [
  { key: 'tate-modern', title: 'Tate Modern' },
  { key: 'british-museum', title: 'British Museum' },
  { key: 'national-gallery', title: 'National Gallery, London' },
  { key: 'vam', title: 'Victoria and Albert Museum' },
  { key: 'science-museum', title: 'Science Museum, London' },
];

async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await got(url, { timeout: { request: 20000 } }).json();
  return res;
}

function pickBestImage(summary) {
  // Prefer originalimage then thumbnail
  const orig = summary?.originalimage?.source;
  const thumb = summary?.thumbnail?.source;
  return orig || thumb || null;
}

function normalizeImageUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    // If width parameter exists, bump to 1920
    if (url.searchParams.has('width')) {
      url.searchParams.set('width', '1920');
      return url.toString();
    }
    return url.toString();
  } catch {
    return u;
  }
}

async function download(url, outfile) {
  const buf = await got(url, { timeout: { request: 30000 } }).buffer();
  await writeFile(outfile, buf);
}

async function updateAttributions(entries) {
  const attrPath = path.resolve(__dirname, '../public/images/ATTRIBUTIONS.md');
  let content = '';
  try { content = await readFile(attrPath, 'utf8'); } catch {}

  const lines = content.split(/\r?\n/);
  for (const { key, pageUrl } of entries) {
    const marker = `- ${key}:`;
    const idx = lines.findIndex(l => l.toLowerCase().startsWith(marker));
    const line = `- ${key}: ${pageUrl}`;
    if (idx >= 0) lines[idx] = line; else lines.push(line);
  }
  const header = lines[0]?.includes('이미지 출처') ? '' : '이미지 출처 및 라이선스 안내\n';
  const out = (header ? header + '\n' : '') + lines.filter(Boolean).join('\n') + '\n';
  await writeFileCb(attrPath, out, 'utf8');
}

async function main() {
  const outDir = path.resolve(__dirname, '../public/images');
  const downloaded = [];
  for (const t of TARGETS) {
    try {
      console.log(`[wiki] ${t.title}…`);
      const sum = await fetchSummary(t.title);
      const img = pickBestImage(sum);
      if (!img) { console.warn(`  no image for ${t.title}`); continue; }
      const imgUrl = normalizeImageUrl(img);
      const ext = (imgUrl.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif|tif|tiff)$/i) || [])[0] || '.jpg';
      const outName = `${t.key}-building${ext}`;
      const outPath = path.join(outDir, outName);
      console.log(`  -> ${imgUrl} => ${outName}`);
      await download(imgUrl, outPath);
      downloaded.push({ key: t.key, pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(t.title)}` });
    } catch (e) {
      console.error(`[fail] ${t.title}:`, e.message || e);
    }
  }
  if (downloaded.length) await updateAttributions(downloaded);
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
