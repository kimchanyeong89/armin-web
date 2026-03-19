const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const MANIFEST_FILE = path.join(DATA_DIR, 'search-manifest.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'search-warm-prefix.json');

const PREFIX_ARTWORK_LIMIT = Number(process.env.WARM_PREFIX_ARTWORK_LIMIT || 45);
const PREFIX_ARTIST_LIMIT = Number(process.env.WARM_PREFIX_ARTIST_LIMIT || 8);

const normalize = (value = '') =>
  String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\u00ad/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const getPrefix = (value = '') => {
  const normalized = normalize(value);
  if (!normalized) return '#';
  const first = normalized[0] || '#';
  if (/[a-z]/.test(first)) return first;
  if (/[0-9]/.test(first)) return '#';
  if (/^[\uac00-\ud7a3]$/.test(first)) return 'ko';
  return 'other';
};

const toCompactArtwork = (art) => ({
  id: art.id,
  n: art.n || '',
  a: art.a || 'Unknown',
  i: art.i || '',
  m: art.m || '',
  e: art.e || '',
  d: art.d || '',
  u: art.u || ''
});

async function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error(`search-manifest.json not found: ${MANIFEST_FILE}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
  if (chunks.length === 0) {
    throw new Error('Manifest has no chunks.');
  }

  const bucketMap = new Map();

  const getBucket = (prefix) => {
    if (!bucketMap.has(prefix)) {
      bucketMap.set(prefix, {
        artworks: [],
        artists: new Map(),
        artistSamples: new Map()
      });
    }
    return bucketMap.get(prefix);
  };

  for (const chunkFile of chunks) {
    const chunkPath = path.join(DATA_DIR, chunkFile);
    if (!fs.existsSync(chunkPath)) continue;

    const items = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
    for (const art of items) {
      if (!art || !art.id) continue;

      const name = art.n || '';
      const artist = art.a || 'Unknown';
      if (!name || name === 'Untitled') continue;

      const namePrefix = getPrefix(name);
      const artistPrefix = getPrefix(artist);

      const nameBucket = getBucket(namePrefix);
      if (nameBucket.artworks.length < PREFIX_ARTWORK_LIMIT) {
        nameBucket.artworks.push(toCompactArtwork(art));
      }

      if (artist && artist !== 'Unknown') {
        const artistBucket = getBucket(artistPrefix);
        artistBucket.artists.set(artist, (artistBucket.artists.get(artist) || 0) + 1);
        if (!artistBucket.artistSamples.has(artist) && art.i) {
          artistBucket.artistSamples.set(artist, art.i);
        }
      }
    }
  }

  const prefixes = Array.from(bucketMap.keys()).sort((a, b) => a.localeCompare(b));
  const out = {
    t: new Date().toISOString(),
    v: 1,
    limits: {
      artworks: PREFIX_ARTWORK_LIMIT,
      artists: PREFIX_ARTIST_LIMIT,
    },
    buckets: {}
  };

  for (const prefix of prefixes) {
    const bucket = bucketMap.get(prefix);
    const topArtists = Array.from(bucket.artists.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, PREFIX_ARTIST_LIMIT)
      .map(([artist, count]) => ({
        artist,
        count,
        image: bucket.artistSamples.get(artist) || ''
      }));

    out.buckets[prefix] = {
      artworks: bucket.artworks,
      artists: topArtists,
    };
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out));
  const sizeKb = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`✅ warm prefix index generated: ${path.relative(ROOT, OUTPUT_FILE)} (${sizeKb} KB, prefixes=${prefixes.length})`);
}

main().catch((error) => {
  console.error('❌ failed to build warm prefix index:', error.message || error);
  process.exit(1);
});
