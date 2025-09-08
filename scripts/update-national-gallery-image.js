import got from 'got';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Wikimedia Commons original file via Special:FilePath (follows redirects)
  // Source page: https://commons.wikimedia.org/wiki/File:National_Gallery_London_06.jpg
  const remoteUrl = 'https://commons.wikimedia.org/wiki/Special:FilePath/National_Gallery_London_06.jpg?width=1920';
  const outPath = path.resolve(__dirname, '../public/images/national-gallery-building.jpg');
  console.log(`[download] ${remoteUrl} -> ${outPath}`);
  const buf = await got(remoteUrl, { timeout: { request: 20000 } }).buffer();
  await writeFile(outPath, buf);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Failed to update National Gallery image:', err.message || err);
  process.exit(1);
});
