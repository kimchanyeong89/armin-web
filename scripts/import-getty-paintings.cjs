const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/getty-collection.json');

const API_ROOT = 'https://www.getty.edu/art/collection/api';
const SEARCH_URL = `${API_ROOT}/search`;
const GET_URL = `${API_ROOT}/get`;

const CLASSIFICATION = 'Painting';
const REQUIRE_IMAGES = 'true';

// Getty supports big sizes; 1000 returns all 781 paintings-with-images today.
const SEARCH_PAGE_SIZE = 1000;
// /api/get supports batching via repeated id= params.
const GET_BATCH_SIZE = 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toYear(dateText) {
  if (!dateText) return 0;
  const m = String(dateText).match(/\b(\d{4})\b/);
  return m ? parseInt(m[1], 10) : 0;
}

function pickArtist(producers) {
  if (!Array.isArray(producers) || producers.length === 0) return 'Unknown';
  const artists = producers
    .filter((p) => {
      const name = String(p?.primary_name || '').trim();
      if (!name) return false;
      if (name.toLowerCase() === 'unknown') return false;
      const roles = Array.isArray(p?.role) ? p.role.map((r) => String(r || '').toLowerCase()) : [];
      return roles.length === 0 || roles.includes('artist');
    })
    .map((p) => String(p.primary_name).trim())
    .filter(Boolean);

  if (artists.length === 0) return 'Unknown';
  return Array.from(new Set(artists)).slice(0, 3).join(', ');
}

function buildGettyDetailUrl(slugWithPath) {
  const slug = String(slugWithPath || '').trim();
  if (!slug) return '';
  // slug_with_path looks like "/object/106EWT". Real pages are under /art/collection/object/...
  return `https://www.getty.edu/art/collection${slug}`;
}

function buildImageUrlFromItem(item, width = 900) {
  // Prefer IIIF ImageService from image_metadata
  const svc = item?.image_metadata?.find?.((m) => typeof m?.imageService === 'string')?.imageService;
  if (typeof svc === 'string' && svc.startsWith('http')) {
    return `${svc}/full/${width},/0/default.jpg`;
  }
  // Fallback: manifest thumb (usually 300x300)
  const thumb = item?.manifest?.thumb;
  if (typeof thumb === 'string' && thumb.startsWith('http')) return thumb;
  return '';
}

async function fetchJson(url, retry = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if ((res.status === 429 || res.status === 503) && retry < 5) {
    const delay = 1500 * (retry + 1);
    console.log(`Rate limited (status=${res.status}) — sleep ${delay}ms, retry ${retry + 1}/5`);
    await sleep(delay);
    return fetchJson(url, retry + 1);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function searchAllIds() {
  const ids = [];
  let from = 0;

  while (true) {
    const u = new URL(SEARCH_URL);
    u.searchParams.set('from', String(from));
    u.searchParams.set('size', String(SEARCH_PAGE_SIZE));
    u.searchParams.append('classification_and_object_type', CLASSIFICATION);
    u.searchParams.append('images', REQUIRE_IMAGES);

    const j = await fetchJson(u.toString());
    const page = Array.isArray(j.data) ? j.data : [];
    if (page.length === 0) break;

    for (const it of page) {
      if (it?.id) ids.push(String(it.id));
    }

    from += page.length;
    console.log(`search: +${page.length} ids (total=${ids.length}/${j.total ?? '?'})`);
    if (page.length < SEARCH_PAGE_SIZE) break;
    await sleep(250);
  }

  return Array.from(new Set(ids));
}

async function getDetailsBatch(ids) {
  const u = new URL(GET_URL);
  for (const id of ids) u.searchParams.append('id', id);
  const j = await fetchJson(u.toString());
  return Array.isArray(j.data) ? j.data : [];
}

(async () => {
  console.log('Fetching Getty paintings (with images)...');

  const ids = await searchAllIds();
  console.log(`\nFound ${ids.length} painting ids (images=true).`);

  const out = [];
  for (let i = 0; i < ids.length; i += GET_BATCH_SIZE) {
    const batch = ids.slice(i, i + GET_BATCH_SIZE);
    process.stdout.write(`details: ${i + 1}-${Math.min(i + batch.length, ids.length)} / ${ids.length}... `);

    const items = await getDetailsBatch(batch);
    for (const it of items) {
      const title = String(it?.primary_name || '').trim() || 'Untitled';
      const date = String(it?.date_created || '').trim();
      const year = toYear(date);
      const dimensions = Array.isArray(it?.dimensions) ? it.dimensions.join(' | ') : '';
      const detailUrl = buildGettyDetailUrl(it?.slug_with_path);
      const image = buildImageUrlFromItem(it, 900);
      const thumb = typeof it?.manifest?.thumb === 'string' ? it.manifest.thumb : '';

      out.push({
        id: String(it?.id || ''),
        title,
        artist: pickArtist(it?.producers),
        date,
        year,
        medium: it?.medium || it?.materials || '',
        dimensions,
        category: CLASSIFICATION,
        imageUrl: image,
        thumbnailUrl: thumb,
        onView: it?.on_view === true,
        openContent: it?.open_content === true,
        publicDomain: it?.open_content === true, // Getty Open Content is effectively public domain (CC0) on their site
        sourceUrl: detailUrl,
        raw: {
          manifest: it?.manifest?.url || null,
          iiifImageService: it?.image_metadata?.find?.((m) => typeof m?.imageService === 'string')?.imageService || null,
        }
      });
    }

    console.log(`+${items.length} (mapped=${out.length})`);
    await sleep(250);
  }

  const withImages = out.filter((x) => !!x.imageUrl);
  console.log(`\nSaving ${withImages.length} items to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(withImages, null, 2));
  console.log('Stats:', {
    total: withImages.length,
    onView: withImages.filter((x) => x.onView).length,
    openContent: withImages.filter((x) => x.openContent).length,
  });
})();
