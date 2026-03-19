/* Probe National Museum of China legacy collection dataset chunks
   and print category folder names found when painting-related tokens appear.

   Usage:
     node ./scripts/probe-chnmuseum-folders.cjs
*/

const BASE = 'https://www.chnmuseum.cn/portals/0/web/zt/cangpin/json/cangpin2/cangpin_';
const MAX = Number(process.env.MAX || '120');

async function main() {
  const allFolders = new Set();
  for (let i = 1; i <= MAX; i++) {
    const url = `${BASE}${i}.js`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const text = await res.text();

    const re = /\\\/image2\\\/([^\\\/]+)\\\//g;
    let m;
    while ((m = re.exec(text))) allFolders.add(m[1]);
  }

  const folders = [...allFolders].map((s) => String(s).trim()).filter(Boolean).sort();
  console.log(`Unique folders in first ${MAX} chunks: ${folders.length}`);
  for (const f of folders) console.log('-', f);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
