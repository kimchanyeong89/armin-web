const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RIJKS = path.join(ROOT, 'public/data/rijksmuseum-paintings-collection.json');
const EGYPT = path.join(ROOT, 'public/data/egyptian-museum-cairo-collection.json');
const EGYPT_SITEMAP_SNAPSHOT = '/tmp/egypt-portfolio.xml';

function backup(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, out);
  return out;
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fixRijks() {
  const data = JSON.parse(fs.readFileSync(RIJKS, 'utf8'));
  const artworks = Array.isArray(data.artworks) ? data.artworks : [];

  const kept = artworks.filter((item) => {
    const imageUrl = String(item.imageUrl || '').trim();
    const image = String(item.image || '').trim();
    return Boolean(imageUrl || image);
  });

  const removed = artworks.length - kept.length;
  data.artworks = kept;
  data.total_count = kept.length;
  data.last_updated = new Date().toISOString();

  fs.writeFileSync(RIJKS, JSON.stringify(data, null, 2));
  return { before: artworks.length, after: kept.length, removed };
}

function parseSitemapUrls(xmlText) {
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  for (const m of xmlText.matchAll(re)) {
    const url = m[1].trim();
    if (url.includes('/artefacts/')) urls.push(url);
  }
  return urls;
}

function buildSlugMap(urls) {
  const map = new Map();
  for (const url of urls) {
    const parts = url.split('/').filter(Boolean);
    const slug = normalizeSlug(parts[parts.length - 1] || '');
    if (slug) map.set(slug, url);
  }
  return map;
}

function fixEgyptian() {
  const items = JSON.parse(fs.readFileSync(EGYPT, 'utf8'));
  if (!Array.isArray(items)) {
    throw new Error('Egyptian data is not an array');
  }

  let linked = 0;
  let missingMap = 0;

  if (fs.existsSync(EGYPT_SITEMAP_SNAPSHOT)) {
    const xml = fs.readFileSync(EGYPT_SITEMAP_SNAPSHOT, 'utf8');
    const urls = parseSitemapUrls(xml);
    const slugMap = buildSlugMap(urls);

    for (const item of items) {
      const id = String(item.id || '');
      const fromId = normalizeSlug(id.replace(/^egyptian-cairo-/, ''));
      if (!fromId) continue;
      const source = slugMap.get(fromId);
      if (source) {
        item.sourceUrl = source;
        linked += 1;
      } else {
        missingMap += 1;
      }
    }
  }

  fs.writeFileSync(EGYPT, JSON.stringify(items, null, 2));
  return { total: items.length, linked, missingMap, hasSnapshot: fs.existsSync(EGYPT_SITEMAP_SNAPSHOT) };
}

function main() {
  const backups = {
    rijks: backup(RIJKS),
    egypt: backup(EGYPT),
  };

  const rijks = fixRijks();
  const egypt = fixEgyptian();

  console.log(JSON.stringify({ backups, rijks, egypt }, null, 2));
}

main();
