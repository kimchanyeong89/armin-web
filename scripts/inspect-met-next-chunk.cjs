/*
  Download a Met Next.js chunk and scan for likely API endpoints.

  Usage:
    node scripts/inspect-met-next-chunk.cjs

  Env:
    CHUNK_URL=...
*/

const fs = require('node:fs/promises');

const CHUNK_URL = process.env.CHUNK_URL ||
  'https://www.metmuseum.org/_next/static/chunks/app/%5Blocale%5D/(navigation)/art/collection/search/page-f012ce5a9d6cb515.js';

const pickUrls = (text) => {
  const out = new Set();
  const re = /https?:\/\/[^\s"<>]+/g;
  let m;
  while ((m = re.exec(text)) && out.size < 5000) out.add(m[0]);
  return Array.from(out);
};

(async () => {
  const res = await fetch(CHUNK_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('status', res.status);
  const text = await res.text();
  console.log('bytes', text.length);
  await fs.writeFile('/tmp/met_next_chunk.js', text);
  console.log('wrote /tmp/met_next_chunk.js');

  const urls = pickUrls(text)
    .filter((u) => /metmuseum\.org|api|graphql|search|collection/i.test(u))
    .slice(0, 200);

  const hits = [];
  const needles = [
    '/api/',
    'graphql',
    'collection',
    'listing',
    'search',
    'artworks',
    'results',
    'collectionapi.metmuseum.org',
  ];

  for (const n of needles) {
    const idx = text.toLowerCase().indexOf(n.toLowerCase());
    if (idx >= 0) hits.push({ needle: n, index: idx, snippet: text.slice(Math.max(0, idx - 80), Math.min(text.length, idx + 200)) });
  }

  console.log('urlsSample', urls.slice(0, 40));
  console.log('hits', hits.map((h) => ({ needle: h.needle, index: h.index })));

  await fs.writeFile('debug-met-next-chunk-hits.json', JSON.stringify({ chunkUrl: CHUNK_URL, urls, hits }, null, 2));
  console.log('wrote debug-met-next-chunk-hits.json');
})();
