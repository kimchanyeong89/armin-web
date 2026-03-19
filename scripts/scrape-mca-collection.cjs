const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_JSON = path.join(__dirname, '../public/data/mca-collection.json');
const OUTPUT_CSV = path.join(__dirname, '../public/data/mca-collection.csv');

const BASE_URL = 'https://www.mca.com.au';
const LIST_API = `${BASE_URL}/api/query-artworks/?show=all`;

const CONCURRENCY = Number(process.env.CONCURRENCY || 12);
const RETRIES = Number(process.env.RETRIES || 2);
const LIMIT = Number(process.env.LIMIT || 0);
const CHECKPOINT_EVERY = Number(process.env.CHECKPOINT_EVERY || 100);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(value) {
  const v = cleanText(value);
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('/')) return `${BASE_URL}${v}`;
  return `${BASE_URL}/${v.replace(/^\/+/, '')}`;
}

function extractArtworkCodeFromUrl(url) {
  const m = String(url || '').match(/\/collection\/artworks\/([^/?#]+)\/?/i);
  return m ? m[1] : '';
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        referer: `${BASE_URL}/collection/artworks/?show=all`,
      },
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(text);
          return;
        }
        reject(new Error(`GET ${url} failed: ${res.statusCode} ${text.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
  });
}

function extractWindowApiDataJsonText(html) {
  const marker = 'var windowApiData = ';
  const idx = html.indexOf(marker);
  if (idx < 0) return '';

  const start = html.indexOf('{', idx + marker.length);
  if (start < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }

  return '';
}

function toMetadataMap(rows) {
  const out = {};
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const label = cleanText(row.label);
    const value = cleanText(row.value);
    if (!label || !value) continue;
    out[label] = value;
  }

  return out;
}

function pickField(metadata, candidates) {
  for (const c of candidates) {
    if (metadata[c]) return cleanText(metadata[c]);
  }
  return '';
}

function deriveCategoryFromMedium(medium) {
  const m = cleanText(medium).toLowerCase();
  if (!m) return '';

  if (/\b(video|film|moving image|single channel|multi-channel|projection)\b/.test(m)) return 'Video';
  if (/\b(photo|photograph|photographic|c-type|inkjet print|pigment print)\b/.test(m)) return 'Photography';
  if (/\b(print|etching|lithograph|screenprint|linocut|woodcut|monotype|aquatint)\b/.test(m)) return 'Print';
  if (/\b(drawing|charcoal|graphite|pastel|ink on paper|watercolour)\b/.test(m)) return 'Drawing';
  if (/\b(paint|oil on|acrylic|tempera|gouache|enamel on|canvas|linen)\b/.test(m)) return 'Painting';
  if (/\b(sculpture|bronze|marble|stone|wood|resin|fibreglass|ceramic|clay|terracotta)\b/.test(m)) return 'Sculpture';
  if (/\b(installation|mixed media|site-specific|assemblage|neon|lightbox)\b/.test(m)) return 'Installation';
  if (/\b(textile|fabric|weaving|embroidery|tapestry)\b/.test(m)) return 'Textile';

  return '';
}

function normalizeListItem(item) {
  const detailUrl = toAbsoluteUrl(item.url || '');
  const artworkCode = extractArtworkCodeFromUrl(detailUrl) || cleanText(item.accessionNo);
  const baseImage = toAbsoluteUrl(item?.image?.src || '');

  return {
    id: artworkCode ? `mca-${artworkCode.toLowerCase()}` : `mca-${Math.random().toString(36).slice(2)}`,
    artworkCode,
    museum: 'Museum of Contemporary Art Australia',
    museumId: 'mca-australia',
    title: cleanText(item.title),
    artist: cleanText(item.artistsText),
    year: cleanText(item.year),
    accessionNo: cleanText(item.accessionNo),
    category: '',
    categorySource: '',
    medium: '',
    dimensions: '',
    creditLine: '',
    onDisplay: false,
    onDisplaySource: '',
    image: baseImage,
    sourceUrl: detailUrl,
    detailMetadata: {},
    rawList: item,
    rawDetail: null,
  };
}

function mergeDetail(base, pageFields) {
  const metadata = toMetadataMap(pageFields.artworkDetails);
  const categoryExplicit = pickField(metadata, ['Category', 'Classification', 'Type', 'Object type']);
  const medium = pickField(metadata, ['Medium', 'Materials', 'Material', 'Technique']);
  const dimensions = pickField(metadata, ['Dimensions']);
  const credit = pickField(metadata, ['Credit']);
  const accession = pickField(metadata, ['Accession number']);
  const isOnDisplay = Boolean(pageFields.isOnDisplay);
  const detailImage = toAbsoluteUrl(pageFields?.image?.src || '') || base.image;

  const categoryDerived = deriveCategoryFromMedium(medium);
  const category = cleanText(categoryExplicit || categoryDerived || 'Artwork');
  const categorySource = categoryExplicit
    ? 'detail_label'
    : categoryDerived
      ? 'derived_from_medium'
      : 'fallback_artwork';

  return {
    ...base,
    title: cleanText(pageFields.title || base.title),
    artist: cleanText(pageFields.artistsText || base.artist),
    year: cleanText(pageFields.year || base.year),
    accessionNo: cleanText(accession || base.accessionNo),
    category,
    categorySource,
    medium: cleanText(medium),
    dimensions: cleanText(dimensions),
    creditLine: cleanText(credit),
    onDisplay: isOnDisplay,
    onDisplaySource: 'detail_page.isOnDisplay',
    image: detailImage,
    detailMetadata: metadata,
    rawDetail: pageFields,
  };
}

async function fetchDetailPageFields(url) {
  const html = await httpGetText(url);
  const jsonText = extractWindowApiDataJsonText(html);
  if (!jsonText) throw new Error('windowApiData not found');

  const data = JSON.parse(jsonText);
  const pageFields = data?.page_fields;
  if (!pageFields || typeof pageFields !== 'object') {
    throw new Error('page_fields missing');
  }
  return pageFields;
}

async function withRetries(fn, retries = 2, baseDelayMs = 350) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await sleep(baseDelayMs * (i + 1));
      }
    }
  }
  throw lastErr;
}

function toCsvValue(value) {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function writeCsv(items, outputPath) {
  const headers = [
    'id',
    'artworkCode',
    'museum',
    'museumId',
    'title',
    'artist',
    'year',
    'accessionNo',
    'category',
    'categorySource',
    'medium',
    'dimensions',
    'creditLine',
    'onDisplay',
    'onDisplaySource',
    'image',
    'sourceUrl',
    'detailMetadataJson',
  ];

  const lines = [headers.map(toCsvValue).join(',')];
  for (const it of items) {
    const row = [
      it.id,
      it.artworkCode,
      it.museum,
      it.museumId,
      it.title,
      it.artist,
      it.year,
      it.accessionNo,
      it.category,
      it.categorySource,
      it.medium,
      it.dimensions,
      it.creditLine,
      it.onDisplay,
      it.onDisplaySource,
      it.image,
      it.sourceUrl,
      JSON.stringify(it.detailMetadata || {}),
    ];
    lines.push(row.map(toCsvValue).join(','));
  }

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let idx = 0;

  async function runOne() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= items.length) return;
      out[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => runOne());
  await Promise.all(workers);
  return out;
}

async function fetchListItems() {
  const text = await httpGetText(LIST_API);
  const parsed = JSON.parse(text);
  const wrapped = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = wrapped
    .map((w) => (w && typeof w === 'object' ? w.item : null))
    .filter((x) => x && typeof x === 'object');

  return items;
}

async function main() {
  console.log('[MCA] Fetching list API...');
  const listItems = await fetchListItems();
  const effective = LIMIT > 0 ? listItems.slice(0, LIMIT) : listItems;
  console.log(`[MCA] List items: ${listItems.length}${LIMIT > 0 ? ` (LIMIT=${LIMIT})` : ''}`);

  const baseRows = effective.map(normalizeListItem);
  let processed = 0;
  const partialRows = new Array(baseRows.length);

  const merged = await mapLimit(baseRows, CONCURRENCY, async (base, index) => {
    try {
      const fields = await withRetries(() => fetchDetailPageFields(base.sourceUrl), RETRIES);
      const row = mergeDetail(base, fields);
      partialRows[index] = row;

      processed += 1;
      if (processed % 25 === 0 || processed === baseRows.length) {
        process.stdout.write(`\r[MCA] detail ${processed}/${baseRows.length}`);
      }

      if (processed % CHECKPOINT_EVERY === 0) {
        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(partialRows.filter(Boolean), null, 2), 'utf8');
      }

      return row;
    } catch (err) {
      processed += 1;
      console.warn(`\n[MCA] detail fail: ${base.sourceUrl} :: ${err.message}`);
      const failed = {
        ...base,
        category: base.category || 'Artwork',
        categorySource: 'fallback_artwork',
        onDisplaySource: base.onDisplaySource || 'unknown',
        _detailError: err.message,
      };
      partialRows[index] = failed;
      return failed;
    }
  });

  const cleaned = merged.filter(Boolean);

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(cleaned, null, 2), 'utf8');
  writeCsv(cleaned, OUTPUT_CSV);

  const onDisplayCount = cleaned.filter((x) => x.onDisplay).length;
  const categoryCounts = {};
  for (const item of cleaned) {
    const key = item.category || 'Unknown';
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;
  }

  console.log('\n[MCA] Done');
  console.log(`[MCA] JSON: ${OUTPUT_JSON}`);
  console.log(`[MCA] CSV : ${OUTPUT_CSV}`);
  console.log(`[MCA] Items: ${cleaned.length}`);
  console.log(`[MCA] On display: ${onDisplayCount}`);
  console.log('[MCA] Top categories:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([k, v]) => console.log(`  - ${k}: ${v}`));
}

main().catch((err) => {
  console.error('[MCA] Fatal:', err);
  process.exitCode = 1;
});
