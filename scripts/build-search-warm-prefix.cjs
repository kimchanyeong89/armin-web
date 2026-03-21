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

const KNOWN_ARTIST_KEYS = {
    'monet': 'monet', 'manet': 'manet', 'renoir': 'renoir', 'picasso': 'picasso',
    'nolde': 'nolde', 'delacroix': 'delacroix', 'gogh': 'gogh', 'rembrandt': 'rembrandt',
    'vermeer': 'vermeer', 'cezanne': 'cezanne', 'degas': 'degas', 'gauguin': 'gauguin',
    'matisse': 'matisse', 'kandinsky': 'kandinsky', 'klimt': 'klimt', 'dali': 'dali',
    'warhol': 'warhol', 'miro': 'miro', 'chagall': 'chagall', 'klee': 'klee',
    'mondrian': 'mondrian', 'pollock': 'pollock', 'rothko': 'rothko', 'bacon': 'bacon',
    'hockney': 'hockney', 'basquiat': 'basquiat', 'caravaggio': 'caravaggio',
    'raphael': 'raphael', 'michelangelo': 'michelangelo', 'botticelli': 'botticelli',
    'titian': 'titian', 'tintoretto': 'tintoretto', 'veronese': 'veronese',
    'rubens': 'rubens', 'velazquez': 'velazquez', 'goya': 'goya', 'greco': 'greco',
    'bruegel': 'bruegel', 'bosch': 'bosch', 'durer': 'durer', 'holbein': 'holbein',
    'constable': 'constable', 'turner': 'turner', 'gainsborough': 'gainsborough',
    'reynolds': 'reynolds', 'hogarth': 'hogarth', 'whistler': 'whistler',
    'sargent': 'sargent', 'homer': 'homer', 'eakins': 'eakins', 'cassatt': 'cassatt',
    'seurat': 'seurat', 'signac': 'signac', 'caillebotte': 'caillebotte',
    'toulouse': 'toulouse-lautrec', 'lautrec': 'toulouse-lautrec',
    'bonnard': 'bonnard', 'vuillard': 'vuillard', 'redon': 'redon',
    'munch': 'munch', 'ensor': 'ensor', 'kirchner': 'kirchner', 'schiele': 'schiele',
    'kokoschka': 'kokoschka', 'beckmann': 'beckmann', 'grosz': 'grosz', 'dix': 'dix',
    'duchamp': 'duchamp', 'leger': 'leger', 'braque': 'braque', 'gris': 'gris',
    'malevich': 'malevich', 'tatlin': 'tatlin', 'lissitzky': 'lissitzky',
    'rivera': 'rivera', 'kahlo': 'kahlo', 'orozco': 'orozco', 'siqueiros': 'siqueiros',
    'hopper': 'hopper', 'okeefe': 'okeefe', 'wood': 'wood', 'benton': 'benton',
    'lichtenstein': 'lichtenstein', 'rauschenberg': 'rauschenberg', 'johns': 'johns',
    'haring': 'haring', 'koons': 'koons', 'richter': 'richter', 'kiefer': 'kiefer',
    'bourgeois': 'bourgeois', 'kusama': 'kusama', 'ai': 'ai weiwei', 'banksy': 'banksy',
    'fantin': 'fantin-latour', 'latour': 'fantin-latour',
    'heckel': 'heckel', 'pechstein': 'pechstein',
    // Examples and fixes
    'soutine': 'soutine',
    'simonet': 'simonet',
    'desportes': 'desportes',
    'rottluff': 'schmidt-rottluff',
    'ofrembrandt': 'rembrandt',
    'manetti': 'manetti',
    'paik': 'paik',
};

function getArtistKey(name) {
    if (!name) return '';

    let stripped = name.replace(/(?:^|\s)dit\)\s*/i, ' ');
    const bioRegex = /\([^)]*(\d+|active|born|died|century|france|italy|germany|spain|dutch|flemish|british|lithuania|american|english)[^)]*(\)|$)/ig;
    stripped = stripped.replace(bioRegex, ' ');
    stripped = stripped.replace(/[()]/g, ' ');

    if (stripped.includes(',') && !stripped.includes(' and ') && !stripped.includes('&')) {
        const parts = stripped.split(',');
        if (parts.length >= 2) {
            stripped = parts[1] + ' ' + parts[0];
        }
    }

    let normalized = normalize(stripped);
    normalized = normalized
        .replace(/\b(attributed to|workshop of|circle of|follower of|manner of|style of|pupil of|school of|after)\b/g, '')
        .replace(/\b(attribue a|atelier de|entourage de|d apres|ecole de|skole|verksted|tilskrevet|nach)\b/g, '')
        .replace(/\b(workshop ofrembrandt)\b/g, 'rembrandt')
        .replace(/\brembrandts\b/g, 'rembrandt');

    const tokens = normalized.split(/[\s-]+/).filter(t => t.length > 2 && !['the', 'van', 'der', 'von', 'and', 'und', 'la', 'le'].includes(t));

    for (const token of tokens) {
        if (KNOWN_ARTIST_KEYS[token]) {
            return KNOWN_ARTIST_KEYS[token];
        }
    }

    return tokens.sort().join(' ');
}

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
  const globalArtistCounts = new Map();


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
        const artistKey = getArtistKey(artist);
        if (artistKey) {
            const artistBucket = getBucket(artistPrefix);
            
            // We use the raw artist name but group them logically
            if (!artistBucket.artistGroups) artistBucket.artistGroups = new Map();
            if (!artistBucket.artistGroups.has(artistKey)) {
                artistBucket.artistGroups.set(artistKey, { variants: new Map(), totalCount: 0 });
            }
            
            const group = artistBucket.artistGroups.get(artistKey);
            group.variants.set(artist, (group.variants.get(artist) || 0) + 1);
            group.totalCount++;
            globalArtistCounts.set(artistKey, (globalArtistCounts.get(artistKey) || 0) + 1);

            
            if (!artistBucket.artistSamples.has(artistKey) && art.i) {
                artistBucket.artistSamples.set(artistKey, art.i);
            }
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
    const topArtists = [];
    
    if (bucket.artistGroups) {
      const groups = Array.from(bucket.artistGroups.entries())
        .sort((a, b) => b[1].totalCount - a[1].totalCount)
        .slice(0, PREFIX_ARTIST_LIMIT);
        
      for (const [key, group] of groups) {
          let bestName = '';
          let bestCount = -1;
          for (const [name, count] of group.variants.entries()) {
              if (count > bestCount) {
                  bestCount = count;
                  bestName = name;
              }
          }
          topArtists.push({
              artist: bestName,
              count: globalArtistCounts.get(key) || group.totalCount,
              sortScore: group.totalCount,
              image: bucket.artistSamples.get(key) || ''
          });
      }
    }

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
