#!/usr/bin/env node
/**
 * M+ (Hong Kong) Collection Highlights scraper.
 *
 * Why Puppeteer?
 * - The site uses an internal GraphQL API ("/api/graphql/") protected by Cloudflare.
 * - Direct server-side fetch/curl is blocked, but the browser session can access it.
 *
 * Strategy:
 * 1) Load the collection page with the desired filter preset.
 * 2) Intercept GraphQL responses and accumulate artworks.
 * 3) Scroll to trigger pagination until no new items.
 *
 * Output:
 *   public/data/mplus-collection-highlights.json
 *
 * Env:
 *   HEADLESS=1|0 (default 1)
 *   MAX_SCROLLS=60 (default 40)
 *   IDLE_ROUNDS=4 (default 3)   // stop after N rounds with no new items
 *   PAGED=1 (default 1)         // use explicit GraphQL paging instead of scroll heuristics
 *   PER_PAGE=20 (default 20)
 *   MAX_PAGES=0 (default 0 = no cap)
 *   MAX_ITEMS=0 (default 0 = no cap)
 *   INCLUDE_RAW=1|0 (default 0) // include full raw payload per record (can get huge)
 *   SHUFFLE_SEED=7298 (default 7298)
 *   ALLOW_API_IMAGES=1|0 (default 0) // allow constructing /api/images/{id}/... (often 404)
 *   MEDIA_CHUNK=40 (default 40)
 *   CONSTITUENTS_CHUNK=120 (default 120)
 *   ONLY_2D=1 (default 1)            // keep only 2D-ish classification categories
 *   MPLUS_2D_ALLOW=...               // comma-separated allowlist overriding defaults
 *   FETCH_DETAILS=1|0 (default 0)    // fetch Medium/Dimensions from detail HTML (slow)
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const OUT_DIR = path.join(process.cwd(), 'public', 'data');

// Allow overriding collection + output target so this script can also be
// reused for full permanent collections (not only "Collection Highlights").
const COLLECTION_NAME = String(process.env.COLLECTION_NAME || 'M+ Collection');
const OUT_BASENAME = String(process.env.OUT_BASENAME || 'mplus-collection-highlights.json');
// GraphQL enum argument; keep the original default for highlight runs.
// If PRIORITISE is explicitly set in the env (even to an empty string),
// honour that instead of falling back, so we can disable prioritisation for
// full-collection scrapes.
const PRIORITISE = (Object.prototype.hasOwnProperty.call(process.env, 'PRIORITISE')
  ? String(process.env.PRIORITISE || '')
  : 'HIGHLIGHTS'
).trim();

const OUT_JSON = path.join(OUT_DIR, OUT_BASENAME);

const HEADLESS = String(process.env.HEADLESS || '1') !== '0';
const MAX_SCROLLS = Math.max(1, Number(process.env.MAX_SCROLLS || '40') || 40);
const IDLE_ROUNDS = Math.max(1, Number(process.env.IDLE_ROUNDS || '3') || 3);
const PAGED = String(process.env.PAGED || '1') === '1';
const PER_PAGE = Math.max(1, Number(process.env.PER_PAGE || '20') || 20);
const MAX_PAGES = Math.max(0, Number(process.env.MAX_PAGES || '0') || 0);
const MAX_ITEMS = Math.max(0, Number(process.env.MAX_ITEMS || '0') || 0);
const INCLUDE_RAW = String(process.env.INCLUDE_RAW || '0') === '1';
const SHUFFLE_SEED = String(process.env.SHUFFLE_SEED || '7298');
const DEBUG_MISSING = String(process.env.DEBUG_MISSING || '0') === '1';
const ALLOW_API_IMAGES = String(process.env.ALLOW_API_IMAGES || '0') === '1';
const INTROSPECT_OBJECT_FIELDS = String(process.env.INTROSPECT_OBJECT_FIELDS || '0') === '1';
const CAPTURE_DETAIL_QUERY = String(process.env.CAPTURE_DETAIL_QUERY || '0') === '1';
const DEBUG_DETAIL_HTML = String(process.env.DEBUG_DETAIL_HTML || '0') === '1';

const ONLY_2D = String(process.env.ONLY_2D || '1') === '1';
const DEFAULT_2D_ALLOW = [
  'Painting',
  'Drawing',
  'Collage',
  'Poster',
  'Photography',
  'Photographic print',
  'Architectural Photography',
  'Architectural Drawing',
  'Design Drawing',
  'Print',
  'Ink Art',
  'Work on Paper',
  'Ephemera',
  'Archival Documentation',
];

const DEFAULT_2D_DENY = [
  'Sculpture',
  'Installation',
  'Video',
  'Video Installation',
  'Animation',
  'Performance',
  'Sound',
  'Film',
  'Costume',
  'Textile',
  'Furniture',
  'Design Object',
  'Lighting',
  'Craft Object',
  'Architectural Model',
  'Maquette',
  'Architectural Fragment',
  'Signage',
  'Multiple',
  'Interior',
];

const TWO_D_ALLOW = new Set(
  String(process.env.MPLUS_2D_ALLOW || DEFAULT_2D_ALLOW.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const TWO_D_DENY = new Set(
  String(process.env.MPLUS_2D_DENY || DEFAULT_2D_DENY.join(','))
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const FETCH_DETAILS = String(process.env.FETCH_DETAILS || '0') === '1';

// Keep GraphQL payload sizes conservative; M+ sometimes responds with HTML error pages
// when the browser session gets throttled or a request is too large.
const CONSTITUENTS_CHUNK = Math.max(20, Number(process.env.CONSTITUENTS_CHUNK || '120') || 120);
const MEDIA_CHUNK = Math.max(10, Number(process.env.MEDIA_CHUNK || '40') || 40);

// Default to the original highlights view, but allow overriding to other
// pre-filtered collection URLs (e.g. "Objects with Images" for permanent
// collections) via env.
const COLLECTION_URL =
  process.env.COLLECTION_URL ||
  'https://www.mplus.org.hk/en/collection/?filter=%7B%22filterSelected%22%3A%7B%22sort%22%3A%22Collection%20Highlights%22,%22collections%22%3A%22M%2B%20Collection%22%7D,%22userInteraction%22%3Atrue%7D';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const ensureHttps = (u) => {
  const s = String(u || '').trim();
  if (!s) return '';
  return s.replace(/^http:\/\//i, 'https://');
};

const pick = (...vals) => {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
};

const normalizeDimensions = (s) => {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.replace(/\s*[xX×]\s*/g, '×').replace(/\s+/g, ' ').trim();
};

const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const stripTags = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const getCategoryPartsFromRecord = (raw) => {
  const parts = toArray(raw?.classificationByType?.category)
    .map((c) => pick(c?.description?.en?.txt, c?.description?.zh_hant?.txt, c?.description?.zh_hans?.txt))
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .flatMap((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
  return parts;
};

const is2DRecord = (raw) => {
  if (!ONLY_2D) return true;
  const parts = getCategoryPartsFromRecord(raw).map((s) => s.toLowerCase());
  if (!parts.length) return false;

  // If any category part is explicitly non-2D (3D/time-based), drop it.
  if (parts.some((p) => TWO_D_DENY.has(p))) return false;

  // Otherwise keep if at least one part matches our 2D allowlist.
  return parts.some((p) => TWO_D_ALLOW.has(p) || (p.includes('photograph') && TWO_D_ALLOW.has('photography')));
};

const parseObjectDetailsFromHtml = (html) => {
  // M+ object detail pages render a simple label/value list in the HTML.
  // We can parse Medium and Dimensions (often "duration: ..." for time-based works)
  // without relying on GraphQL schema introspection.
  const out = { medium: '', dimensions: '' };
  const s = String(html || '');
  if (!s) return out;

  const extractValueAfterLabel = (label) => {
    // Match: "Label:</div> <div class=... value ...>VALUE</div>"
    const re = new RegExp(`${label}\\s*:<\\/div>\\s*<div[^>]*\\bvalue\\b[^>]*>([\\s\\S]*?)<\\/div>`, 'i');
    const m = s.match(re);
    if (!m) return '';
    return stripTags(m[1]);
  };

  out.medium = extractValueAfterLabel('Medium');
  out.dimensions = extractValueAfterLabel('Dimensions');
  return out;
};

const pickBestMediaUrl = (media, preferredWidth = 1200) => {
  if (!media || typeof media !== 'object') return '';
  const images = Array.isArray(media.images)
    ? media.images
    : media.images && typeof media.images === 'object'
      ? [media.images]
      : [];
  const scored = images
    .map((img) => {
      const w = Number(img?.width) || 0;
      const u = pick(img?.secure_url);
      if (!u || !w) return null;
      return { url: ensureHttps(u), width: w, score: Math.abs(w - preferredWidth) };
    })
    .filter(Boolean);
  if (scored.length) {
    scored.sort((a, b) => a.score - b.score);
    return scored[0].url;
  }
  const fallback = pick(media?.secure_url, media?.url);
  return ensureHttps(fallback);
};

let HIGHLIGHT_IDS = new Set();

const mapRecordToArtwork = (raw, lookups) => {
  // M+ collection object shape (as observed from /api/graphql response):
  // - objectNumber: "2013.159"
  // - title: { en: { txt }, zh_hant: { txt } }
  // - displayDate: { en: { txt } }
  // - classificationByType.category[].description.en.txt
  // - relatedMedias: [{ id, primaryDisplay }]
  // - slugTitle
  // - onView

  const objectNumber = pick(raw?.objectNumber);
  const slugTitle = pick(raw?.slugTitle);

  const title = pick(raw?.title?.en?.txt, raw?.title?.zh_hant?.txt, raw?.title?.zh_hans?.txt);
  const dateText = pick(raw?.displayDate?.en?.txt, raw?.displayDate?.zh_hant?.txt, raw?.displayDate?.zh_hans?.txt);

  const catParts = getCategoryPartsFromRecord(raw);
  const category = catParts.join(', ');

  let isHighlight = false;
  if (HIGHLIGHT_IDS && HIGHLIGHT_IDS.size) {
    const keys = [objectNumber, slugTitle].filter(Boolean).map((s) => String(s));
    isHighlight = keys.some((k) => HIGHLIGHT_IDS.has(k));
  }

  const onView = raw?.onView === true;

  const mediaId =
    toArray(raw?.relatedMedias).find((m) => m?.primaryDisplay === true)?.id ||
    toArray(raw?.relatedMedias)[0]?.id ||
    null;

  const media = mediaId && lookups?.mediaById ? lookups.mediaById.get(Number(mediaId)) : null;
  const bestMediaUrl = pickBestMediaUrl(media, 1200);
  // IMPORTANT: Do not assume relatedMedias.id can be used as /api/images/{id}/... .
  // Constructed URLs frequently 404 (causing "images not showing" in the app).
  // Prefer the Cloudinary URL returned by medias().
  const image = bestMediaUrl || (ALLOW_API_IMAGES && mediaId ? `https://www.mplus.org.hk/api/images/${mediaId}/width-1200` : '');

  // Resolve artist/creator from constituents lookup when available
  const rc = toArray(raw?.relatedConstituents)
    .map((c) => ({ id: Number(c?.id), order: Number(c?.displayOrder) || 999 }))
    .filter((x) => Number.isFinite(x.id));
  rc.sort((a, b) => a.order - b.order);
  const artistNames = rc
    .map((c) => {
      const cons = lookups?.constituentById ? lookups.constituentById.get(c.id) : null;
      if (DEBUG_MISSING && lookups?.constituentById && !cons) {
        // Helpful when diagnosing "Unknown" creators.
        // Avoid spamming: only log a few times per run.
        if (!mapRecordToArtwork._missingLogged) mapRecordToArtwork._missingLogged = new Set();
        if (mapRecordToArtwork._missingLogged.size < 20 && !mapRecordToArtwork._missingLogged.has(c.id)) {
          mapRecordToArtwork._missingLogged.add(c.id);
          console.log(`[debug] missing constituent id=${c.id} for objectNumber=${objectNumber}`);
        }
      }
      return pick(cons?.name?.en?.txt, cons?.name?.zh_hant?.txt, cons?.name?.zh_hans?.txt);
    })
    .filter(Boolean);
  const artist = artistNames.length ? artistNames.join(', ') : 'Unknown';

  const detailUrl = slugTitle ? `https://www.mplus.org.hk/en/collection/objects/${slugTitle}/` : '';

  const extra = slugTitle && lookups?.detailBySlug ? lookups.detailBySlug.get(String(slugTitle)) : null;
  const medium = pick(extra?.medium);
  const dimensions = pick(extra?.dimensions);

  return {
    id: objectNumber || (slugTitle ? `mplus-${slugTitle}` : `mplus-${Math.random().toString(16).slice(2)}`),
    title: title || 'Untitled',
    artist,
    date: dateText,
    category,
    // Preserve more classification context for downstream filtering.
    objectType: pick(raw?.ofnaaCategory),
    classificationParts: catParts,
    medium,
    dimensions,
    image,
    images: image ? [image] : [],
    detailUrl,
    sourceUrl: detailUrl,
    onView: !!onView,
    highlight: !!isHighlight,
    ...(INCLUDE_RAW ? { raw } : null),
  };
};

const buildObjectsQuery = (page, perPage) => {
  // Mirrors what the site requests (observed from intercepted requests).
  // We keep shuffle + shuffleSeed stable so paging covers the full set deterministically.
  const args = [
    'publicAccess: true',
    'shuffle: true',
    `shuffleSeed: "${SHUFFLE_SEED}"`,
    `collectionName: "${COLLECTION_NAME}"`,
  ];
  if (PRIORITISE) args.push(`prioritise: ${PRIORITISE}`);
  args.push(`page: ${page}`, `per_page: ${perPage}`);

  return `{
    objects_0: objects(
      ${args.join(', ')}
    ) {
      _sys { pagination { perPage maxPage page total } }
      ofnaaCategory
      objectNumber
      title { en { txt } zh_hant { txt } }
      supplementaryTitle { en { txt } zh_hant { txt } }
      creditLine { en { txt } zh_hant { txt } }
      relatedConstituents { id displayOrder publicAccess }
      relatedMedias { id publicAccess primaryDisplay displayOrder }
      slugTitle
      onView
      researchCentreIndicator
      restrictImageDownload
      incompleteCataloguing
      displayDate { en { txt } zh_hant { txt } }
      classificationByType {
        archivalLevel { description { en { txt } } }
        category { description { en { txt } zh_hant { txt } } displayOrder }
      }
      status { en { txt } }
      relatedObjects { id selfType { en { txt } zh_hant { txt } } relatedType { en { txt } zh_hant { txt } } }
    }
  }`;
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const buildConstituentsQuery = (ids) => {
  const list = ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return `{
    constituents_0: constituents(publicAccess: true, id_s: [${list.join(',')}]) {
      id
      name { en { txt } zh_hant { txt } }
      slugName
    }
  }`;
};

const buildMediasQuery = (ids) => {
  const list = ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return `{
    medias_0: medias(publicAccess: true, id_s: [${list.join(',')}]) {
      id
      altText { en { txt } zh_hant { txt } }
      photoCredit { en { txt } zh_hant { txt } }
      images { width height secure_url }
      mediaUses { mediaUse { en { txt } } displayOrder }
    }
  }`;
};

const fetchGraphqlInPage = async (page, query) => {
  // Use in-page fetch so Cloudflare sees a real browser session.
  return page.evaluate(async (q) => {
    const res = await fetch('/api/graphql/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q }),
      credentials: 'same-origin',
    });
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Non-JSON response from /api/graphql: ${text.slice(0, 200)}`);
    }
    return res.json();
  }, query);
};

const fetchGraphqlInPageWithRetry = async (page, query, opts = {}) => {
  const retries = Math.max(0, Number(opts.retries ?? 2));
  const delayMs = Math.max(0, Number(opts.delayMs ?? 250));
  const maxDelayMs = Math.max(delayMs, Number(opts.maxDelayMs ?? 4000));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchGraphqlInPage(page, query);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const backoff = Math.min(maxDelayMs, delayMs * (attempt + 1));
        await delay(backoff);
      }
    }
  }
  throw lastErr;
};

const fetchHtmlInPageWithRetry = async (page, url, opts = {}) => {
  const retries = Math.max(0, Number(opts.retries ?? 2));
  const delayMs = Math.max(0, Number(opts.delayMs ?? 250));
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'same-origin' });
        return { ok: res.ok, status: res.status, text: await res.text() };
      }, url);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await delay(delayMs * (attempt + 1));
    }
  }
  throw lastErr;
};

const findRecordsInGraphql = (payload) => {
  // Collect likely M+ collection objects from GraphQL payload.
  const results = [];
  const seen = new Set();

  const isLikelyObject = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    // M+ object has objectNumber + slugTitle, and often relatedMedias.
    return !!(obj.objectNumber && obj.slugTitle);
  };

  const add = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const key = String(obj.objectNumber || obj.id || obj.uuid || obj.slugTitle || JSON.stringify(obj).slice(0, 80));
    if (seen.has(key)) return;
    seen.add(key);
    results.push(obj);
  };

  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      // Heuristic: if the array contains any likely collection objects, add those objects.
      const anyObj = node.some(isLikelyObject);
      if (anyObj) {
        for (const x of node) if (isLikelyObject(x)) add(x);
      } else {
        for (const x of node) visit(x);
      }
      return;
    }

    if (typeof node !== 'object') return;

    // Common patterns: { items: [...] }, { nodes: [...] }, { results: [...] }, { edges: [{node: ...}] }
    for (const arr of [node.items, node.nodes, node.results, node.records]) {
      if (Array.isArray(arr)) for (const x of arr) if (isLikelyObject(x)) add(x);
    }
    if (Array.isArray(node.edges)) {
      for (const e of node.edges) {
        const n = e?.node;
        if (isLikelyObject(n)) add(n);
      }
    }

    for (const v of Object.values(node)) visit(v);
  };

  visit(payload?.data || payload);
  return results;
};

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // User requested: delete current collected data before re-scraping.
  // We still write a fresh file at the end; this just avoids confusion when runs fail mid-way.
  try {
    await fs.rm(OUT_JSON, { force: true });
  } catch {
    // ignore
  }

  // Optionally infer highlight membership for full-collection runs by
  // cross-referencing the existing highlights JSON (if present).
  // This is best-effort and harmless for the original highlights scrape
  // (the file will usually not exist yet or will be empty).
  HIGHLIGHT_IDS = new Set();
  try {
    const highlightPath = path.join(OUT_DIR, 'mplus-collection-highlights.json');
    const txt = await fs.readFile(highlightPath, 'utf8');
    const arr = JSON.parse(txt);
    for (const item of Array.isArray(arr) ? arr : []) {
      const baseId = String(item?.id || '').trim();
      if (baseId) HIGHLIGHT_IDS.add(baseId);
      const url = String(item?.detailUrl || item?.sourceUrl || '');
      const m = url.match(/\/objects\/([^/]+)\//);
      if (m && m[1]) HIGHLIGHT_IDS.add(m[1]);
    }
  } catch {
    // no existing highlights file; fine
  }

  console.log('🏛️ M+ Collection Highlights scraper');
  console.log(
    `HEADLESS=${HEADLESS} PAGED=${PAGED} MAX_SCROLLS=${MAX_SCROLLS} IDLE_ROUNDS=${IDLE_ROUNDS} PER_PAGE=${PER_PAGE} MAX_PAGES=${MAX_PAGES} MAX_ITEMS=${MAX_ITEMS} INCLUDE_RAW=${INCLUDE_RAW} ONLY_2D=${ONLY_2D} FETCH_DETAILS=${FETCH_DETAILS}`
  );
  console.log(`URL: ${COLLECTION_URL}`);
  console.log(`COLLECTION_NAME=${COLLECTION_NAME} OUT_BASENAME=${OUT_BASENAME} PRIORITISE=${PRIORITISE || '(none)'}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=site-per-process',
    ],
    defaultViewport: { width: 1400, height: 900 },
  });

  const artworksById = new Map();
  const constituentById = new Map();
  const mediaById = new Map();
  const detailBySlug = new Map();
  const rawSamples = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Some sites require a short delay before navigation to stabilize stealth settings.
    await delay(400);

    const graphqlRequests = [];

    page.on('request', (req) => {
      try {
        const url = req.url();
        if (!url.includes('/api/graphql')) return;
        if (req.method() !== 'POST') return;
        const postData = req.postData();
        if (postData) graphqlRequests.push({ url, postData });
      } catch {
        // ignore
      }
    });

    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!url.includes('/api/graphql')) return;

        const ct = String(res.headers()['content-type'] || '').toLowerCase();
        if (!ct.includes('application/json')) return;

        const json = await res.json();
        rawSamples.push({ url, json });

        // If the site issues constituent/media lookup queries, capture them for enrichment.
        for (const c of toArray(json?.data?.constituents_0)) {
          const id = Number(c?.id);
          if (Number.isFinite(id) && !constituentById.has(id)) constituentById.set(id, c);
        }
        for (const m of toArray(json?.data?.medias_0)) {
          const id = Number(m?.id);
          if (Number.isFinite(id) && !mediaById.has(id)) mediaById.set(id, m);
        }

        // In PAGED mode we do explicit enrichment and mapping in a controlled order.
        // Avoid prematurely mapping object records here (it would lock in Unknown artists/images).
        if (PAGED) return;

        const records = findRecordsInGraphql(json);
        for (const r of records) {
          const a = mapRecordToArtwork(r, { constituentById, mediaById });
          if (!a.image) continue;
          if (!artworksById.has(a.id)) artworksById.set(a.id, a);
          else {
            // Merge/upgrade fields if we learned something new.
            const prev = artworksById.get(a.id);
            if (prev && !prev.onView && a.onView) prev.onView = true;
            if (prev && (!prev.dimensions || prev.dimensions.length < 2) && a.dimensions) prev.dimensions = a.dimensions;
            if (prev && (!prev.category || prev.category.length < 2) && a.category) prev.category = a.category;
            if (prev && (!prev.medium || prev.medium.length < 2) && a.medium) prev.medium = a.medium;
            if (prev && (!prev.artist || prev.artist === 'Unknown') && a.artist && a.artist !== 'Unknown') prev.artist = a.artist;
            if (prev && (!prev.image || prev.image.length < 10) && a.image) prev.image = a.image;
            if (prev && Array.isArray(a.images) && a.images.length && (!Array.isArray(prev.images) || !prev.images.length)) prev.images = a.images;
            if (prev && (!prev.detailUrl || prev.detailUrl.length < 10) && a.detailUrl) prev.detailUrl = a.detailUrl;
          }
        }
      } catch {
        // ignore non-JSON or parsing errors
      }
    });

    console.log('Loading page...');
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle2', timeout: 120000 });

    // Wait a bit for client-side rendering & initial API calls
    await delay(5000);

    if (INTROSPECT_OBJECT_FIELDS) {
      try {
        const schemaQ = `{
          __schema {
            queryType {
              fields {
                name
                type { kind name ofType { kind name ofType { kind name } } }
              }
            }
          }
        }`;
        const schemaRes = await fetchGraphqlInPageWithRetry(page, schemaQ, { retries: 1, delayMs: 400 });
        if (Array.isArray(schemaRes?.errors) && schemaRes.errors.length) {
          console.log('[introspect] schema errors:', schemaRes.errors[0]?.message || JSON.stringify(schemaRes.errors[0]));
        }
        const qFields = toArray(schemaRes?.data?.__schema?.queryType?.fields);
        const objectsField = qFields.find((f) => f?.name === 'objects');
        console.log('[introspect] query field "objects" type:', JSON.stringify(objectsField?.type || null));

        const typeNameGuess =
          objectsField?.type?.ofType?.ofType?.name || // e.g. LIST -> NON_NULL -> <Type>
          objectsField?.type?.ofType?.name ||
          objectsField?.type?.name ||
          null;

        if (!typeNameGuess) {
          console.log('[introspect] could not infer objects() item type name');
        } else {
          const q = `{
            __type(name: "${typeNameGuess}") {
              name
              fields { name }
            }
          }`;
          const res = await fetchGraphqlInPageWithRetry(page, q, { retries: 1, delayMs: 400 });
          if (Array.isArray(res?.errors) && res.errors.length) {
            console.log('[introspect] __type errors:', res.errors[0]?.message || JSON.stringify(res.errors[0]));
          }
          const fields = toArray(res?.data?.__type?.fields).map((f) => f?.name).filter(Boolean);
          const filtered = fields.filter((n) => /medium|dimension|duration|measure|material|format|objectType|type/i.test(n));
          console.log(`[introspect] ${typeNameGuess} fields matched:`, filtered.sort().join(', '));
          console.log(`[introspect] total ${typeNameGuess} fields:`, fields.length);
        }
      } catch (e) {
        console.log('[introspect] failed:', e?.message || String(e));
      }
      await browser.close();
      return;
    }

    if (PAGED) {
      // Explicit paging: fetch pages directly rather than relying on scroll heuristics.
      // This reliably reaches beyond the first ~60 items.
      const first = await fetchGraphqlInPageWithRetry(page, buildObjectsQuery(0, PER_PAGE), { retries: 6, delayMs: 800, maxDelayMs: 8000 });
      const firstRecords = findRecordsInGraphql(first);
      const firstObj = first?.data?.objects_0 || first?.data?.objects_2;
      const pagination = firstObj?.[0]?._sys?.pagination;

      const ingestPage = async (records) => {
        const eligible = ONLY_2D ? records.filter(is2DRecord) : records;
        if (ONLY_2D) {
          const dropped = records.length - eligible.length;
          if (dropped > 0) console.log(`[filter] kept ${eligible.length}/${records.length} (dropped ${dropped} non-2D)`);
        }

        // Enrich lookups for this page (batch constituents + medias), then map artworks.
        const consIds = [];
        const mediaIds = [];
        for (const r of eligible) {
          for (const c of toArray(r?.relatedConstituents)) {
            const id = Number(c?.id);
            if (Number.isFinite(id)) consIds.push(id);
          }
          for (const m of toArray(r?.relatedMedias)) {
            const id = Number(m?.id);
            if (Number.isFinite(id)) mediaIds.push(id);
          }
        }

        const uniq = (arr) => Array.from(new Set(arr)).filter((n) => Number.isFinite(Number(n)));
        const uniqStr = (arr) => Array.from(new Set(arr.map((x) => String(x)))).filter((s) => s && s !== 'undefined' && s !== 'null');
        const consUnique = uniq(consIds).filter((id) => !constituentById.has(Number(id)));
        const mediaUnique = uniq(mediaIds).filter((id) => !mediaById.has(Number(id)));

        if (FETCH_DETAILS) {
          // Fetch Medium/Dimensions from object detail pages.
          // This is slow and can trigger throttling; keep it optional.
          const slugs = uniqStr(
            eligible
              .map((r) => pick(r?.slugTitle))
              .filter(Boolean)
          ).filter((s) => !detailBySlug.has(String(s)));

          for (const slug of slugs) {
            try {
              const url = `https://www.mplus.org.hk/en/collection/objects/${slug}/`;
              const res = await fetchHtmlInPageWithRetry(page, url, { retries: 2, delayMs: 250 });
              if (!res?.ok) {
                if (DEBUG_DETAIL_HTML) console.log(`[debug] detail fetch failed status=${res?.status} slug=${slug}`);
                continue;
              }
              if (DEBUG_DETAIL_HTML && !detailBySlug.has(String(slug))) {
                const p = path.join(process.cwd(), 'downloads', `mplus-detail-${String(slug).slice(0, 80)}.html`);
                await fs.mkdir(path.dirname(p), { recursive: true });
                await fs.writeFile(p, res.text, 'utf8');
                console.log(`[debug] saved detail html -> ${p}`);
              }
              const parsed = parseObjectDetailsFromHtml(res.text);
              if (DEBUG_DETAIL_HTML && !(parsed?.medium || parsed?.dimensions)) {
                console.log(`[debug] parsed empty medium/dimensions slug=${slug}`);
              }
              if (parsed?.medium || parsed?.dimensions) detailBySlug.set(String(slug), parsed);
            } catch {
              // ignore
            }
            await delay(90);
          }

          if (DEBUG_DETAIL_HTML) {
            console.log(`[debug] detailBySlug size=${detailBySlug.size} after ${slugs.length} slugs`);
          }
        }

        // Chunk to keep query size manageable.
        for (const part of chunk(consUnique, CONSTITUENTS_CHUNK)) {
          if (!part.length) continue;
          const cj = await fetchGraphqlInPageWithRetry(page, buildConstituentsQuery(part), { retries: 2, delayMs: 250 });
          for (const c of toArray(cj?.data?.constituents_0)) {
            const id = Number(c?.id);
            if (Number.isFinite(id) && !constituentById.has(id)) constituentById.set(id, c);
          }
          await delay(80);
        }
        for (const part of chunk(mediaUnique, MEDIA_CHUNK)) {
          if (!part.length) continue;
          const mj = await fetchGraphqlInPageWithRetry(page, buildMediasQuery(part), { retries: 2, delayMs: 250 });

          if (Array.isArray(mj?.errors) && mj.errors.length) {
            const firstErr = mj.errors[0];
            const msg = typeof firstErr?.message === 'string' ? firstErr.message : JSON.stringify(firstErr);
            console.log(`[warn] medias query returned errors (count=${mj.errors.length}) :: ${msg.slice(0, 220)}`);
          }

          const got = toArray(mj?.data?.medias_0);
          if (!got.length) {
            console.log(`[warn] medias lookup returned 0 results for ${part.length} ids`);
          }

          for (const m of got) {
            const id = Number(m?.id);
            if (Number.isFinite(id) && !mediaById.has(id)) mediaById.set(id, m);
          }
          await delay(80);
        }

        for (const r of eligible) {
          const a = mapRecordToArtwork(r, { constituentById, mediaById, detailBySlug });
          if (!a.image) continue;
          if (!artworksById.has(a.id)) artworksById.set(a.id, a);
        }
      };

      await ingestPage(firstRecords);

      if (CAPTURE_DETAIL_QUERY) {
        const slug = pick(firstRecords?.[0]?.slugTitle);
        const detailUrl = slug ? `https://www.mplus.org.hk/en/collection/objects/${slug}/` : '';
        if (detailUrl) {
          console.log(`[capture] navigating to detail page: ${detailUrl}`);
          await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 120000 });
          await delay(5000);
          const outPath = path.join(process.cwd(), 'downloads', 'mplus-graphql-requests-detail.json');
          await fs.writeFile(outPath, JSON.stringify(graphqlRequests, null, 2), 'utf8');
          console.log(`[capture] wrote -> ${outPath}`);
        } else {
          console.log('[capture] no slugTitle found to navigate to detail page');
        }
        await browser.close();
        return;
      }

      const total = pagination?.total;
      const maxPage = pagination?.maxPage;
      console.log(`pagination: total=${total} maxPage=${maxPage} perPage=${pagination?.perPage}`);

      const hardMaxPage = typeof maxPage === 'number' ? maxPage : 0;
      const capPages = MAX_PAGES > 0 ? Math.min(hardMaxPage, MAX_PAGES - 1) : hardMaxPage;

      for (let p = 1; p <= capPages; p++) {
        if (MAX_ITEMS > 0 && artworksById.size >= MAX_ITEMS) break;
        const json = await fetchGraphqlInPageWithRetry(page, buildObjectsQuery(p, PER_PAGE), { retries: 6, delayMs: 800, maxDelayMs: 8000 });
        const records = findRecordsInGraphql(json);
        await ingestPage(records);
        if (p % 10 === 0 || p === 1) {
          console.log(`page=${p}/${capPages} items=${artworksById.size}`);
        }
        await delay(200);
      }
    } else {
      let idle = 0;
      let lastCount = 0;

      for (let i = 0; i < MAX_SCROLLS; i++) {
        // Scroll a full viewport height to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, Math.max(800, window.innerHeight)));
        await delay(1200);

        // Also nudge to bottom occasionally
        if (i % 5 === 4) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await delay(1400);
        }

        const count = artworksById.size;
        if (count === lastCount) idle += 1;
        else idle = 0;

        lastCount = count;
        if (i === 0 || i % 5 === 0) {
          console.log(`scroll=${i + 1}/${MAX_SCROLLS} items=${count} idle=${idle}/${IDLE_ROUNDS}`);
        }

        if (idle >= IDLE_ROUNDS) break;
      }
    }

    const out = Array.from(artworksById.values());
    // Sort: onView first, then title
    out.sort((a, b) => {
      if (a.onView !== b.onView) return a.onView ? -1 : 1;
      return String(a.title).localeCompare(String(b.title));
    });

    console.log(`Collected ${out.length} artworks with images.`);

    await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`Wrote -> ${OUT_JSON}`);

    // Save one sample payload + request for debugging (first GraphQL response)
    if (rawSamples.length) {
      const sampleDir = path.join(process.cwd(), 'downloads');
      await fs.mkdir(sampleDir, { recursive: true });

      const pickSample = (pred) => rawSamples.find((s) => {
        try {
          return !!pred(s?.json);
        } catch {
          return false;
        }
      });

      const objSample = pickSample((j) => j?.data && (j.data.objects_0 || j.data.objects_2));
      const consSample = pickSample((j) => j?.data && j.data.constituents_0);
      const mediaSample = pickSample((j) => j?.data && j.data.medias_0);

      const writeIf = async (name, payload) => {
        if (!payload) return;
        const p = path.join(sampleDir, name);
        await fs.writeFile(p, JSON.stringify(payload, null, 2) + '\n', 'utf8');
        console.log(`Saved sample -> ${p}`);
      };

      await writeIf('mplus-graphql-sample.json', rawSamples[0]);
      await writeIf('mplus-graphql-sample-objects.json', objSample);
      await writeIf('mplus-graphql-sample-constituents.json', consSample);
      await writeIf('mplus-graphql-sample-medias.json', mediaSample);
    }

    if (graphqlRequests.length) {
      const reqPath = path.join(process.cwd(), 'downloads', 'mplus-graphql-requests.json');
      await fs.mkdir(path.dirname(reqPath), { recursive: true });
      await fs.writeFile(reqPath, JSON.stringify(graphqlRequests.slice(0, 10), null, 2) + '\n', 'utf8');
      console.log(`Saved request samples -> ${reqPath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
